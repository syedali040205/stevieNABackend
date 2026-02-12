import { Router, Request, Response } from "express";
import { checkDatabaseHealth } from "../config/supabase";
import { sessionManager } from "../services/sessionManager";
import axios from "axios";
import logger from "../utils/logger";

const router = Router();

/**
 * Check health of the Python AI service by pinging its /health endpoint.
 * Returns true if the service responds with 200, false otherwise.
 */
async function checkAIServiceHealth(): Promise<boolean> {
  const aiServiceUrl = process.env.AI_SERVICE_URL || "http://localhost:8000";
  try {
    const response = await axios.get(`${aiServiceUrl}/health`, {
      timeout: 5000, // 5 second timeout for health check
    });
    return response.status === 200;
  } catch (error: any) {
    logger.warn("ai_service_health_check_failed", {
      url: aiServiceUrl,
      error: error.message,
    });
    return false;
  }
}

/**
 * Health check endpoint
 * Verifies database connectivity, session storage, and AI service status
 *
 * Requirements: 7.13, 8.5
 *
 * @route GET /api/health
 * @returns {object} 200 - Service health status
 * @returns {object} 503 - Service unhealthy
 */
router.get("/", async (_req: Request, res: Response) => {
  try {
    const startTime = Date.now();

    // Run all health checks in parallel
    const [isDatabaseHealthy, isSessionStorageHealthy, isAIServiceHealthy] =
      await Promise.all([
        checkDatabaseHealth(),
        sessionManager.checkHealth(),
        checkAIServiceHealth(),
      ]);

    const responseTime = Date.now() - startTime;

    const allHealthy =
      isDatabaseHealthy && isSessionStorageHealthy && isAIServiceHealthy;

    const healthStatus = {
      success: true,
      status: allHealthy ? "healthy" : "degraded",
      service: "stevie-awards-api",
      services: {
        database: isDatabaseHealthy ? "healthy" : "unhealthy",
        session_storage: isSessionStorageHealthy ? "healthy" : "unhealthy",
        ai_service: isAIServiceHealthy ? "healthy" : "unhealthy",
      },
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString(),
    };

    // Return 503 only if database or session storage is down (critical).
    // AI service being down is degraded but not a full outage — the API
    // itself is still reachable and can serve non-AI requests.
    const criticalHealthy = isDatabaseHealthy && isSessionStorageHealthy;
    const statusCode = criticalHealthy ? 200 : 503;

    res.status(statusCode).json(healthStatus);
  } catch (error) {
    logger.error("health_check_error", { error });

    res.status(503).json({
      success: false,
      status: "unhealthy",
      service: "stevie-awards-api",
      services: {
        database: "unknown",
        session_storage: "unknown",
        ai_service: "unknown",
      },
      error: "Health check failed",
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
