import { Router, Request, Response } from 'express';
import { tavilyCrawler } from '../services/tavilyCrawler';
import { internalAuth } from '../middleware/internalAuth';
import logger from '../utils/logger';

const router = Router();

/**
 * Crawl a website using Tavily
 * @route POST /api/crawler/crawl
 * @access Internal (requires internal API key)
 */
router.post('/crawl', internalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      url,
      maxDepth = 1,
      maxBreadth = 20,
      limit = 50,
      instructions,
      chunksPerSource,
      selectPaths,
      excludePaths,
      selectDomains,
      excludeDomains,
      extractDepth = 'basic',
      includeImages = false,
    } = req.body;

    // Validation
    if (!url) {
      res.status(400).json({
        success: false,
        error: 'BadRequest',
        message: 'URL is required',
      });
      return;
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'BadRequest',
        message: 'Invalid URL format',
      });
      return;
    }

    // Validate depth and breadth
    if (maxDepth < 1 || maxDepth > 5) {
      res.status(400).json({
        success: false,
        error: 'BadRequest',
        message: 'maxDepth must be between 1 and 5',
      });
      return;
    }

    if (maxBreadth < 1 || maxBreadth > 200) {
      res.status(400).json({
        success: false,
        error: 'BadRequest',
        message: 'maxBreadth must be between 1 and 200',
      });
      return;
    }

    if (limit < 1 || limit > 1000) {
      res.status(400).json({
        success: false,
        error: 'BadRequest',
        message: 'limit must be between 1 and 1000',
      });
      return;
    }

    logger.info('crawler_request_received', {
      url,
      maxDepth,
      maxBreadth,
      limit,
    });

    // Crawl the website
    const result = await tavilyCrawler.crawl({
      url,
      maxDepth,
      maxBreadth,
      limit,
      instructions,
      chunksPerSource,
      selectPaths,
      excludePaths,
      selectDomains,
      excludeDomains,
      extractDepth,
      includeImages,
    });

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('crawler_request_error', {
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      error: 'InternalServerError',
      message: 'Failed to crawl website',
      details: error.message,
    });
  }
});

/**
 * Health check for crawler service
 * @route GET /api/crawler/health
 * @access Public
 */
router.get('/health', async (_req: Request, res: Response): Promise<void> => {
  try {
    const isHealthy = await tavilyCrawler.healthCheck();

    res.status(isHealthy ? 200 : 503).json({
      success: isHealthy,
      service: 'tavily-crawler',
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(503).json({
      success: false,
      service: 'tavily-crawler',
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
