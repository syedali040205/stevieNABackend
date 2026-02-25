import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation';
import { createRateLimiter } from '../middleware/rateLimiter';
import { awardSearchService } from '../services/awardSearchService';
import logger from '../utils/logger';

const router = Router();

/**
 * Award search specific rate limiter
 * 60 requests per 15 minutes per IP
 * Requirement 9.1
 */
export const awardSearchRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60,
  message: 'Too many award search requests. Please try again later.',
});

/**
 * Validation schema for award search requests
 * Requirement 9.2
 */
const awardSearchSchema = z.object({
  query: z
    .string()
    .min(1, 'Query cannot be empty')
    .max(1000, 'Query cannot exceed 1000 characters'),
  options: z
    .object({
      forceRefresh: z.boolean().optional(),
    })
    .optional(),
});

/**
 * POST /api/award-search
 * 
 * Search for information about Stevie Awards using natural language queries.
 * 
 * Request body:
 * - query: string (required, 1-1000 characters) - Natural language question
 * - options: object (optional)
 *   - forceRefresh: boolean (optional) - Force refresh cached data
 * 
 * Response:
 * - success: boolean - Whether the search was successful
 * - answer: string - Comprehensive answer with citations
 * - citations: array - Source URLs with titles and snippets
 * - metadata: object - Cache hit status, response time, sources used, query intent
 * - error: object (optional) - Error code and message if failed
 * 
 * Status codes:
 * - 200: Success
 * - 400: Invalid input (missing query, empty query, query too long)
 * - 429: Rate limit exceeded
 * - 503: Queue full (service at capacity)
 * - 500: Internal server error
 * 
 * Requirements: 1.1, 9.1, 9.2, 9.5, 9.6, 9.7
 */
router.post(
  '/',
  awardSearchRateLimiter,
  validate(awardSearchSchema),
  async (req: Request, res: Response) => {
    const correlationId = (req as any).correlationId;
    const { query } = req.body;

    try {
      logger.info('award_search_request', {
        correlationId,
        query,
        queryLength: query.length,
        ip: req.ip,
      });

      // Execute search
      const result = await awardSearchService.search(query);
      const { success, metadata, error } = result;

      // Handle queue full error - Requirement 9.7
      if (!success && error?.code === 'QUEUE_FULL') {
        logger.warn('award_search_queue_full_response', {
          correlationId,
          query,
        });

        return res.status(503).json(result);
      }

      // Handle other errors
      if (!success) {
        logger.error('award_search_failed', {
          correlationId,
          query,
          errorCode: error?.code,
          errorMessage: error?.message,
        });

        return res.status(500).json(result);
      }

      // Success - Requirement 9.5
      logger.info('award_search_success', {
        correlationId,
        query,
        cacheHit: metadata.cacheHit,
        responseTimeMs: metadata.responseTimeMs,
        sourcesUsed: metadata.sourcesUsed,
        queryIntent: metadata.queryIntent,
      });

      return res.status(200).json(result);
    } catch (error: any) {
      logger.error('award_search_route_error', {
        correlationId,
        query,
        error: error.message,
        stack: error.stack,
      });

      // Return generic error response
      return res.status(500).json({
        success: false,
        answer: '',
        citations: [],
        metadata: {
          cacheHit: false,
          responseTimeMs: 0,
          sourcesUsed: 0,
          queryIntent: 'unknown',
        },
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
        },
      });
    }
  }
);

export default router;
