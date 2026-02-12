import { Router, Request, Response } from 'express';
import { openaiService } from '../services/openaiService';
import { intentClassifier } from '../services/intentClassifier';
import { pineconeClient } from '../services/pineconeClient';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /api/diagnostic/openai
 * Test OpenAI connection
 */
router.get('/openai', async (_req: Request, res: Response) => {
  try {
    const testResponse = await openaiService.chatCompletion({
      messages: [
        { role: 'system', content: 'You are a test assistant.' },
        { role: 'user', content: 'Say "test successful" in 2 words' },
      ],
      temperature: 0.0,
      maxTokens: 10,
    });

    res.json({
      success: true,
      service: 'openai',
      response: testResponse,
      message: 'OpenAI connection working',
    });
  } catch (error: any) {
    logger.error('openai_diagnostic_failed', { error: error.message });
    res.status(500).json({
      success: false,
      service: 'openai',
      error: error.message,
    });
  }
});

/**
 * GET /api/diagnostic/intent
 * Test intent classification
 */
router.get('/intent', async (_req: Request, res: Response) => {
  try {
    const result = await intentClassifier.classifyIntent({
      message: 'Hello',
      conversationHistory: [],
      userContext: {},
    });

    res.json({
      success: true,
      service: 'intent_classifier',
      result,
      message: 'Intent classification working',
    });
  } catch (error: any) {
    logger.error('intent_diagnostic_failed', { error: error.message });
    res.status(500).json({
      success: false,
      service: 'intent_classifier',
      error: error.message,
    });
  }
});

/**
 * GET /api/diagnostic/pinecone
 * Test Pinecone connection
 */
router.get('/pinecone', async (_req: Request, res: Response) => {
  try {
    const stats = await pineconeClient.getStats();

    res.json({
      success: true,
      service: 'pinecone',
      stats,
      message: 'Pinecone connection working',
    });
  } catch (error: any) {
    logger.error('pinecone_diagnostic_failed', { error: error.message });
    res.status(500).json({
      success: false,
      service: 'pinecone',
      error: error.message,
    });
  }
});

/**
 * GET /api/diagnostic/all
 * Test all services
 */
router.get('/all', async (_req: Request, res: Response) => {
  const results: any = {
    openai: { status: 'unknown' },
    intent: { status: 'unknown' },
    pinecone: { status: 'unknown' },
  };

  // Test OpenAI
  try {
    await openaiService.chatCompletion({
      messages: [{ role: 'user', content: 'test' }],
      maxTokens: 5,
    });
    results.openai = { status: 'healthy' };
  } catch (error: any) {
    results.openai = { status: 'unhealthy', error: error.message };
  }

  // Test Intent Classifier
  try {
    await intentClassifier.classifyIntent({
      message: 'test',
      conversationHistory: [],
      userContext: {},
    });
    results.intent = { status: 'healthy' };
  } catch (error: any) {
    results.intent = { status: 'unhealthy', error: error.message };
  }

  // Test Pinecone
  try {
    await pineconeClient.getStats();
    results.pinecone = { status: 'healthy' };
  } catch (error: any) {
    results.pinecone = { status: 'unhealthy', error: error.message };
  }

  const allHealthy = Object.values(results).every((r: any) => r.status === 'healthy');

  res.status(allHealthy ? 200 : 503).json({
    success: allHealthy,
    services: results,
    timestamp: new Date().toISOString(),
  });
});

export default router;
