import { Router, Request, Response } from 'express';
import { checkDatabaseHealth } from '../config/supabase';
import { sessionManager } from '../services/sessionManager';

const router = Router();

/**
 * Health check endpoint
 * Verifies database connectivity and service status
 * 
 * Requirements: 7.13, 8.5
 * 
 * @route GET /api/health
 * @returns {object} 200 - Service health status
 * @returns {object} 503 - Service unhealthy
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    
    // Check database connectivity
    const isDatabaseHealthy = await checkDatabaseHealth();
    
    // Check session storage health
    const isSessionStorageHealthy = await sessionManager.checkHealth();
    
    const responseTime = Date.now() - startTime;
    
    const allHealthy = isDatabaseHealthy && isSessionStorageHealthy;
    
    const healthStatus = {
      success: true,
      status: allHealthy ? 'healthy' : 'unhealthy',
      service: 'stevie-awards-api',
      services: {
        database: isDatabaseHealthy ? 'healthy' : 'unhealthy',
        session_storage: isSessionStorageHealthy ? 'healthy' : 'unhealthy',
      },
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString(),
    };

    // Return 503 if any service is unhealthy
    const statusCode = allHealthy ? 200 : 503;
    
    res.status(statusCode).json(healthStatus);
  } catch (error) {
    console.error('Health check error:', error);
    
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      service: 'stevie-awards-api',
      services: {
        database: 'unknown',
        session_storage: 'unknown',
      },
      error: 'Health check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
