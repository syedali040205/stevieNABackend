import { Router, Request, Response } from "express";
import { z } from "zod";
import { validate } from "../middleware/validation";
import { optionalAuth } from "../middleware/auth";
import { chatRateLimiter } from "../middleware/rateLimiter";
import { unifiedChatbotService } from "../services/unifiedChatbotService";
import logger from "../utils/logger";

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
 * 15 seconds is well within most proxy idle timeouts (typically 60s).
 */
const SSE_KEEPALIVE_INTERVAL_MS = 15_000;

/**
 * POST /api/chat
 * Unified chatbot conversation with streaming response
 *
 * This endpoint handles all conversation types:
 * - Question answering (KB search + RAG)
 * - Information collection (asks follow-up questions)
 * - Mixed (both)
 */
router.post(
  "/chat",
  optionalAuth, // Extract user_id from token if present
  chatRateLimiter, // 60 requests per 15 minutes per IP (LLM calls are expensive)
  validate(chatSchema),
  async (req: Request, res: Response) => {
    const correlationId = (req as any).correlationId;
    const { session_id, message } = req.body;

    // Extract userId from auth middleware (if authenticated)
    const userId = (req as any).user?.id;

    try {
      logger.info("unified_chat_request", {
        session_id,
        message_length: message.length,
        user_id: userId || "anonymous",
        correlation_id: correlationId,
      });

      // Set headers for SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      // Start keep-alive heartbeat to prevent proxy/LB idle timeouts.
      // SSE comment lines (`:keepalive\n\n`) are ignored by EventSource clients
      // but keep the TCP connection alive through intermediary proxies.
      const keepAliveTimer = setInterval(() => {
        if (!res.writableEnded) {
          res.write(":keepalive\n\n");
        }
      }, SSE_KEEPALIVE_INTERVAL_MS);

      try {
        // Stream the response (pass userId if available)
        for await (const event of unifiedChatbotService.chat(
          session_id,
          message,
          userId,
        )) {
          if (res.writableEnded) break;
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      } finally {
        // Always clean up the keep-alive timer
        clearInterval(keepAliveTimer);
      }

      if (!res.writableEnded) {
        res.end();
      }
    } catch (error: any) {
      logger.error("unified_chat_error", {
        error: error.message,
        correlation_id: correlationId,
      });

      if (!res.writableEnded) {
        // Send error as SSE event
        res.write(
          `data: ${JSON.stringify({
            type: "error",
            message: "Failed to generate response",
          })}\n\n`,
        );
        res.end();
      }
    }
  },
);

export default router;
