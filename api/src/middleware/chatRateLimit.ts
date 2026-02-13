import { Request, Response, NextFunction } from "express";
import { cacheManager } from "../services/cacheManager";
import logger from "../utils/logger";

const RATE_LIMIT_PREFIX = "ratelimit:chat:";
const WINDOW_SEC = 15 * 60; // 15 minutes
const MAX_AUTHENTICATED = 60; // per user when logged in
const MAX_ANONYMOUS = 20; // per IP when anonymous (stricter to limit abuse)

/**
 * Redis-backed chat rate limiter.
 * Keys by userId when authenticated (industry practice for fair use at scale),
 * otherwise by IP. Shared across API instances via Redis.
 */
export async function chatRateLimitRedis(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = (req as any).user?.id as string | undefined;
  const ip = (req.ip || req.socket?.remoteAddress || "unknown").replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${RATE_LIMIT_PREFIX}${userId ? `user:${userId}` : `ip:${ip}`}`;
  const max = userId ? MAX_AUTHENTICATED : MAX_ANONYMOUS;

  try {
    const count = await cacheManager.incr(key);
    if (count === 1) {
      await cacheManager.expire(key, WINDOW_SEC);
    }

    const remaining = Math.max(0, max - count);
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(Date.now() / 1000) + WINDOW_SEC));

    if (count > max) {
      logger.warn("chat_rate_limit_exceeded", {
        key_type: userId ? "user" : "ip",
        path: req.path,
        method: req.method,
      });
      res.status(429).json({
        success: false,
        error: "TooManyRequests",
        message: "Too many chat requests. Please slow down and try again shortly.",
        timestamp: new Date().toISOString(),
        retryAfter: WINDOW_SEC,
      });
      return;
    }

    next();
  } catch (error: any) {
    logger.error("chat_rate_limit_redis_error", { error: error.message });
    next();
  }
}
