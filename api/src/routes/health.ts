import { Router, Request, Response } from "express";
import { checkDatabaseHealth } from "../config/supabase";
import { sessionManager } from "../services/sessionManager";
import { cacheManager } from "../services/cacheManager";
import logger from "../utils/logger";

const router = Router();

/**
 * Liveness probe (industry standard: process is up).
 * No dependencies; use for orchestrator liveness.
 * @route GET /api/health/live
 * @route HEAD /api/health/live
 */
router.get("/live", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    status: "ok",
    service: "stevie-awards-api",
    timestamp: new Date().toISOString(),
  });
});

router.head("/live", (req: Request, res: Response) => {
  logger.info("health_check_head_request", {
    endpoint: "/api/health/live",
    timestamp: new Date().toISOString(),
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });
  res.sendStatus(200);
});

/**
 * Readiness probe (industry standard: can accept traffic).
 * Checks Redis and database; return 503 if either is down so LB stops sending traffic.
 * @route GET /api/health/ready
 * @route HEAD /api/health/ready
 */
router.get("/ready", async (_req: Request, res: Response) => {
  try {
    const [isRedisHealthy, isDatabaseHealthy] = await Promise.all([
      cacheManager.healthCheck(),
      checkDatabaseHealth(),
    ]);

    const ready = isRedisHealthy && isDatabaseHealthy;
    const statusCode = ready ? 200 : 503;

    res.status(statusCode).json({
      success: ready,
      status: ready ? "ready" : "not_ready",
      service: "stevie-awards-api",
      services: {
        redis: isRedisHealthy ? "healthy" : "unhealthy",
        database: isDatabaseHealthy ? "healthy" : "unhealthy",
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error("readiness_check_error", { error: error.message });
    res.status(503).json({
      success: false,
      status: "not_ready",
      service: "stevie-awards-api",
      error: "Readiness check failed",
      timestamp: new Date().toISOString(),
    });
  }
});

router.head("/ready", async (req: Request, res: Response) => {
  logger.info("health_check_head_request", {
    endpoint: "/api/health/ready",
    timestamp: new Date().toISOString(),
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });
  
  try {
    const [isRedisHealthy, isDatabaseHealthy] = await Promise.all([
      cacheManager.healthCheck(),
      checkDatabaseHealth(),
    ]);

    const ready = isRedisHealthy && isDatabaseHealthy;
    res.sendStatus(ready ? 200 : 503);
  } catch (error: any) {
    logger.error("readiness_check_head_error", { error: error.message });
    res.sendStatus(503);
  }
});

/**
 * Health check endpoint (full detail, backward compatible)
 * Verifies database connectivity, session storage, and Redis cache
 *
 * @route GET /api/health
 * @route HEAD /api/health
 * @returns {object} 200 - Service health status
 * @returns {object} 503 - Service unhealthy
 */
router.get("/", async (_req: Request, res: Response) => {
  try {
    const startTime = Date.now();

    // Run all health checks in parallel
    const [isDatabaseHealthy, isSessionStorageHealthy, isRedisHealthy] =
      await Promise.all([
        checkDatabaseHealth(),
        sessionManager.checkHealth(),
        cacheManager.healthCheck(),
      ]);

    const responseTime = Date.now() - startTime;

    const allHealthy =
      isDatabaseHealthy && isSessionStorageHealthy && isRedisHealthy;

    const healthStatus = {
      success: true,
      status: allHealthy ? "healthy" : "degraded",
      service: "stevie-awards-api",
      services: {
        database: isDatabaseHealthy ? "healthy" : "unhealthy",
        session_storage: isSessionStorageHealthy ? "healthy" : "unhealthy",
        redis: isRedisHealthy ? "healthy" : "unhealthy",
      },
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString(),
    };

    // Return 503 only if database or session storage is down (critical).
    // Redis being down is degraded but not a full outage — the API has graceful degradation.
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
        redis: "unknown",
      },
      error: "Health check failed",
      timestamp: new Date().toISOString(),
    });
  }
});

router.head("/", async (req: Request, res: Response) => {
  logger.info("health_check_head_request", {
    endpoint: "/api/health",
    timestamp: new Date().toISOString(),
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });
  
  try {
    const [isDatabaseHealthy, isSessionStorageHealthy] = await Promise.all([
      checkDatabaseHealth(),
      sessionManager.checkHealth(),
    ]);

    // Return 503 only if critical services are down
    const criticalHealthy = isDatabaseHealthy && isSessionStorageHealthy;
    res.sendStatus(criticalHealthy ? 200 : 503);
  } catch (error: any) {
    logger.error("health_check_head_error", { error: error.message });
    res.sendStatus(503);
  }
});

export default router;
