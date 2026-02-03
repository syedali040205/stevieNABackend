import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation';
import { optionalAuth } from '../middleware/auth';
import { unifiedChatbotService } from '../services/unifiedChatbotService';
import logger from '../utils/logger';

const router = Router();

// Validation schema
const chatSchema = z.object({
  session_id: z.string().uuid(),
  message: z.string().min(1).max(2000),
});

/**
 * POST /api/chat
 * Unified chatbot conversation with streaming response
 * 
 * This endpoint handles all conversation types:
 * - Question answering (KB search + RAG)
 * - Information collection (asks follow-up questions)
 * - Mixed (both)
 */
router.post(
  '/chat',
  optionalAuth,  // Extract user_id from token if present
  validate(chatSchema),
  async (req: Request, res: Response) => {
    const correlationId = (req as any).correlationId;
    const { session_id, message } = req.body;
    
    // Extract userId from auth middleware (if authenticated)
    const userId = (req as any).user?.id;

    try {
      logger.info('unified_chat_request', {
        session_id,
        message_length: message.length,
        user_id: userId || 'anonymous',
        correlation_id: correlationId,
      });

      // Set headers for SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Stream the response (pass userId if available)
      for await (const event of unifiedChatbotService.chat(session_id, message, userId)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      res.end();
    } catch (error: any) {
      logger.error('unified_chat_error', {
        error: error.message,
        correlation_id: correlationId,
      });

      // Send error as SSE event
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: 'Failed to generate response'
      })}\n\n`);
      res.end();
    }
  }
);

export default router;
