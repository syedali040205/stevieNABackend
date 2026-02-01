import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation';
import { chatbotService } from '../services/chatbotService';
import logger from '../utils/logger';

const router = Router();

// Validation schema
const askQuestionSchema = z.object({
  question: z.string().min(1).max(1000),
  max_articles: z.number().min(1).max(10).optional(),
  match_threshold: z.number().min(0).max(1).optional(),
});

/**
 * POST /api/chatbot/ask
 * Ask a question to the Stevie Awards chatbot with streaming response
 */
router.post(
  '/ask',
  validate(askQuestionSchema),
  async (req: Request, res: Response) => {
    const correlationId = (req as any).correlationId;
    const { question, max_articles, match_threshold } = req.body;

    try {
      logger.info('chatbot_ask_request', {
        question_length: question.length,
        correlation_id: correlationId,
      });

      // Set headers for SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Stream the response
      for await (const event of chatbotService.answerQuestionStream(question, {
        maxArticles: max_articles,
        matchThreshold: match_threshold,
      })) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      res.end();
    } catch (error: any) {
      logger.error('chatbot_ask_error', {
        error: error.message,
        correlation_id: correlationId,
      });

      // Send error as SSE event
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: 'Failed to generate answer'
      })}\n\n`);
      res.end();
    }
  }
);

export default router;
