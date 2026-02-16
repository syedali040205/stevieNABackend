import { Router, Request, Response } from 'express';
import { cacheManager } from '../services/cacheManager';
import logger from '../utils/logger';

const router = Router();

/**
 * Redis health check endpoint
 * Tests Redis connectivity and basic operations
 */
router.get('/redis-health', async (_req: Request, res: Response) => {
  try {
    const isAvailable = cacheManager.isAvailable();
    
    if (!isAvailable) {
      return res.status(503).json({
        success: false,
        redis: {
          available: false,
          message: 'Redis is not configured or unavailable',
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Test basic operations
    const testKey = 'health:test';
    const testValue = { test: true, timestamp: Date.now() };
    
    // Test write
    const writeSuccess = await cacheManager.set(testKey, testValue, 10);
    
    // Test read
    const readValue = await cacheManager.get(testKey);
    
    // Test delete
    const deleteSuccess = await cacheManager.delete(testKey);
    
    // Test ping
    const pingSuccess = await cacheManager.healthCheck();

    const allTestsPassed = writeSuccess && readValue !== null && deleteSuccess && pingSuccess;

    return res.status(allTestsPassed ? 200 : 503).json({
      success: allTestsPassed,
      redis: {
        available: true,
        operations: {
          write: writeSuccess,
          read: readValue !== null,
          delete: deleteSuccess,
          ping: pingSuccess,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('redis_health_check_error', { error: error.message });
    
    return res.status(503).json({
      success: false,
      redis: {
        available: false,
        error: error.message,
      },
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
