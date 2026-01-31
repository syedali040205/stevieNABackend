import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { validateJWT } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { conversationRateLimiter } from '../middleware/rateLimiter';
import { conversationOrchestrator } from '../services/conversationOrchestrator';
import logger from '../utils/logger';

const router = Router();

// Validation schemas
const respondSchema = z.object({
  session_id: z.string().uuid(),
  user_message: z.string().min(1).max(5000),
});

/**
 * POST /api/conversation/start
 * Start a new conversation session.
 */
router.post('/start', conversationRateLimiter, validateJWT, async (req: Request, res: Response) => {
  const correlationId = (req as any).correlationId;
  const userId = (req as any).user?.id;

  try {
    logger.info('conversation_start_request', {
      user_id: userId,
      correlation_id: correlationId,
    });

    const result = await conversationOrchestrator.startConversation(userId);

    return res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('conversation_start_error', {
      user_id: userId,
      error: error.message,
      correlation_id: correlationId,
    });

    if (error.message === 'User profile not found') {
      return res.status(404).json({
        success: false,
        error: 'NotFound',
        message: 'User profile not found. Please create a profile first.',
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(500).json({
      success: false,
      error: 'InternalServerError',
      message: 'Failed to start conversation',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/conversation/respond
 * Process user response and continue conversation.
 */
router.post(
  '/respond',
  validateJWT,
  validate(respondSchema),
  async (req: Request, res: Response) => {
    const correlationId = (req as any).correlationId;
    const userId = (req as any).user?.id;
    const { session_id, user_message } = req.body;

    try {
      logger.info('conversation_respond_request', {
        user_id: userId,
        session_id: session_id,
        correlation_id: correlationId,
      });

      const result = await conversationOrchestrator.processUserResponse(
        session_id,
        user_message
      );

      return res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('conversation_respond_error', {
        user_id: userId,
        session_id: session_id,
        error: error.message,
        correlation_id: correlationId,
      });

      if (error.message === 'Session not found') {
        return res.status(404).json({
          success: false,
          error: 'NotFound',
          message: 'Session not found or expired',
          timestamp: new Date().toISOString(),
        });
      }

      return res.status(500).json({
        success: false,
        error: 'InternalServerError',
        message: 'Failed to process response',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;
