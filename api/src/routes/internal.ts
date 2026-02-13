import { Router, Request, Response } from "express";
import { internalAuth } from "../middleware/internalAuth";
import { sessionManager } from "../services/sessionManager";
import logger from "../utils/logger";

const router = Router();

router.use(internalAuth);

/**
 * POST /api/internal/cleanup-sessions
 * Deletes expired user_sessions. Call from cron every 5–15 min.
 * Requires: Authorization: Bearer <INTERNAL_API_KEY> or X-Internal-API-Key: <INTERNAL_API_KEY>
 */
router.post("/cleanup-sessions", async (_req: Request, res: Response) => {
  try {
    const deletedCount = await sessionManager.cleanupExpiredSessions();
    logger.info("cleanup_sessions_completed", { deleted_count: deletedCount });
    res.status(200).json({
      success: true,
      deleted_count: deletedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error("cleanup_sessions_error", { error: error.message });
    res.status(500).json({
      success: false,
      error: "CleanupFailed",
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/internal/cleanup-sessions
 * Same as POST, for cron services that only support GET.
 */
router.get("/cleanup-sessions", async (_req: Request, res: Response) => {
  try {
    const deletedCount = await sessionManager.cleanupExpiredSessions();
    logger.info("cleanup_sessions_completed", { deleted_count: deletedCount });
    res.status(200).json({
      success: true,
      deleted_count: deletedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error("cleanup_sessions_error", { error: error.message });
    res.status(500).json({
      success: false,
      error: "CleanupFailed",
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
