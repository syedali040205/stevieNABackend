import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";

/**
 * Validates INTERNAL_API_KEY for cron/internal endpoints.
 * Accepts: Authorization: Bearer <key> or X-Internal-API-Key: <key>
 */
export function internalAuth(req: Request, res: Response, next: NextFunction): void {
  const key = process.env.INTERNAL_API_KEY;

  if (!key) {
    logger.warn("internal_auth_skipped", { reason: "INTERNAL_API_KEY not set" });
    res.status(503).json({
      success: false,
      error: "ServiceUnavailable",
      message: "Internal API key not configured",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const authHeader = req.headers.authorization;
  const headerKey = req.headers["x-internal-api-key"] as string | undefined;

  const provided = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : headerKey;

  if (!provided || provided !== key) {
    logger.warn("internal_auth_failed", { path: req.path });
    res.status(401).json({
      success: false,
      error: "Unauthorized",
      message: "Invalid or missing internal API key",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  next();
}
