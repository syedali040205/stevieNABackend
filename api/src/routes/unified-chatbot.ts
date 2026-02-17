import { Router, Request, Response } from "express";
import { z } from "zod";
import { validate } from "../middleware/validation";
import { optionalAuth } from "../middleware/auth";
import { chatRateLimitRedis } from "../middleware/chatRateLimit";
import { unifiedChatbotService } from "../services/unifiedChatbotService";
import logger from "../utils/logger";
import {
  chatAbortedTotal,
  chatBusyTotal,
  chatCapacityConfig,
  chatCapacityLimiter,
  chatQueueWaitSeconds,
} from "../utils/chatCapacity";
import { sessionInFlight } from "../utils/sessionInFlight";

const router = Router();

// Validation schema
const chatSchema = z.object({
  session_id: z.string().uuid(),
  message: z.string().min(1).max(2000),
});

/**
 * SSE keep-alive interval in milliseconds.
 * Sends a comment line (`:keepalive`) to prevent proxies, load balancers,
 * and CDNs from closing the connection during slow LLM responses.
 */
const SSE_KEEPALIVE_INTERVAL_MS = 15_000;

function writeSse(res: Response, payload: any, event?: string) {
  if (res.writableEnded) return;
  if (event) res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * POST /api/chat
 * Unified chatbot conversation with streaming response
 */
router.post(
  "/chat",
  optionalAuth, // Must run first so we have user id for rate limit key
  chatRateLimitRedis, // Per-user when authenticated, per-IP when anonymous (Redis-backed)
  validate(chatSchema),
  async (req: Request, res: Response) => {
    const correlationId = (req as any).correlationId;
    const { session_id, message } = req.body;

    // Extract userId from auth middleware (if authenticated)
    const userId = (req as any).user?.id;

    // Set headers for SSE early
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // Keepalive to prevent proxy/LB idle timeouts.
    const keepAliveTimer = setInterval(() => {
      if (!res.writableEnded) res.write(":keepalive\n\n");
    }, SSE_KEEPALIVE_INTERVAL_MS);

    // Abort controller that we propagate down to the OpenAI request.
    const abortController = new AbortController();

    let capacityRelease: (() => void) | null = null;
    let sessionLocked = false;

    const cleanup = () => {
      clearInterval(keepAliveTimer);
      if (capacityRelease) {
        try {
          capacityRelease();
        } catch {
          // ignore
        }
        capacityRelease = null;
      }
      if (sessionLocked) {
        sessionInFlight.release(session_id);
        sessionLocked = false;
      }
    };

    // If client disconnects, abort upstream work.
    const onClose = () => {
      if (!abortController.signal.aborted) {
        abortController.abort();
        chatAbortedTotal.inc({ reason: "client_disconnect" });
      }
      cleanup();
    };

    req.on("close", onClose);
    res.on("close", onClose);

    try {
      logger.info("unified_chat_request", {
        session_id,
        message_length: message.length,
        user_id: userId || "anonymous",
        correlation_id: correlationId,
      });

      // Per-session in-flight guard (reject parallel messages for same session)
      if (!sessionInFlight.tryAcquire(session_id)) {
        chatBusyTotal.inc({ reason: "session_in_flight" });
        writeSse(
          res,
          {
            type: "busy",
            message: "A response is already being generated for this session. Please wait.",
          },
          "busy",
        );
        res.end();
        return;
      }
      sessionLocked = true;

      // Global capacity limiter with bounded wait (2–5 seconds)
      const acquireStart = Date.now();
      const acquired = await chatCapacityLimiter.acquire({
        timeoutMs: chatCapacityConfig.queueTimeoutMs,
      });

      const waitSeconds = (Date.now() - acquireStart) / 1000;
      chatQueueWaitSeconds.observe(waitSeconds);

      if (!acquired.ok) {
        chatBusyTotal.inc({ reason: "capacity_timeout" });
        writeSse(
          res,
          {
            type: "busy",
            message:
              "We’re helping a lot of people right now. Please retry in a moment.",
            retry_after_ms: chatCapacityConfig.queueTimeoutMs,
          },
          "busy",
        );
        res.end();
        return;
      }

      capacityRelease = acquired.release;

      // Stream response
      for await (const event of unifiedChatbotService.chat({
        sessionId: session_id,
        message,
        userId,
        signal: abortController.signal,
      })) {
        if (res.writableEnded) break;
        writeSse(res, event);
      }

      if (!res.writableEnded) {
        res.end();
      }
    } catch (error: any) {
      // Abort should not be treated as an error response; client is gone.
      if (error?.name === "AbortError" || error?.code === "ABORT_ERR") {
        cleanup();
        return;
      }

      // Profile missing/incomplete: tell the client explicitly.
      if (error?.code === "OnboardingRequired" || error?.message === "OnboardingRequired") {
        writeSse(
          res,
          {
            type: "onboarding_required",
            message: "Please complete onboarding before using the chatbot.",
            code: "OnboardingRequired",
            details: error?.details ?? undefined,
          },
          "onboarding_required",
        );
        res.end();
        return;
      }

      logger.error("unified_chat_error", {
        error: error.message,
        correlation_id: correlationId,
      });

      if (!res.writableEnded) {
        writeSse(
          res,
          {
            type: "error",
            message: "Failed to generate response",
          },
          "error",
        );
        res.end();
      }
    } finally {
      cleanup();
    }
  },
);

export default router;
