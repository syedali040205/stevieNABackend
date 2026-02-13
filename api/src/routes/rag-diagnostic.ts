import { Router, Request, Response } from 'express';
import { pineconeClient } from '../services/pineconeClient';
import { openaiService } from '../services/openaiService';
import logger from '../utils/logger';

const router = Router();

/**
 * RAG Diagnostic Endpoint
 * Tests the entire RAG pipeline to identify issues
 */
router.get('/rag-test', async (_req: Request, res: Response) => {
  const results: any = {
    timestamp: new Date().toISOString(),
    tests: {},
    summary: { passed: 0, failed: 0 },
  };

  try {
    // Test 1: Check environment variables
    results.tests.env_vars = {
      name: 'Environment Variables',
      status: 'checking',
      details: {},
    };

    const requiredVars = [
      'OPENAI_API_KEY',
      'PINECONE_API_KEY',
      'PINECONE_INDEX_NAME',
      'SUPABASE_URL',
    ];

    const missingVars: string[] = [];
    for (const varName of requiredVars) {
      const exists = !!process.env[varName];
      results.tests.env_vars.details[varName] = exists ? 'Set' : 'Missing';
      if (!exists) missingVars.push(varName);
    }

    if (missingVars.length === 0) {
      results.tests.env_vars.status = 'passed';
      results.summary.passed++;
    } else {
      results.tests.env_vars.status = 'failed';
      results.tests.env_vars.error = `Missing: ${missingVars.join(', ')}`;
      results.summary.failed++;
    }

    // Test 2: Check Pinecone stats
    results.tests.pinecone = {
      name: 'Pinecone Vector Database',
      status: 'checking',
    };

    try {
      const stats = await pineconeClient.getStats();
      results.tests.pinecone.status = 'passed';
      results.tests.pinecone.details = {
        totalVectors: stats.totalRecordCount,
        namespaces: stats.namespaces,
      };
      results.summary.passed++;

      if (stats.totalRecordCount === 0) {
        results.tests.pinecone.warning = 'No vectors found - upload documents first';
      }
    } catch (error: any) {
      results.tests.pinecone.status = 'failed';
      results.tests.pinecone.error = error.message;
      results.summary.failed++;
    }

    // Test 3: Test embedding generation
    results.tests.embeddings = {
      name: 'OpenAI Embeddings',
      status: 'checking',
    };

    try {
      const testText = 'test query';
      const embedding = await openaiService.generateEmbedding(testText);
      results.tests.embeddings.status = 'passed';
      results.tests.embeddings.details = {
        dimensions: embedding.length,
        model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
      };
      results.summary.passed++;
    } catch (error: any) {
      results.tests.embeddings.status = 'failed';
      results.tests.embeddings.error = error.message;
      results.summary.failed++;
    }

    // Test 4: Test RAG query
    results.tests.rag_query = {
      name: 'RAG Query Pipeline',
      status: 'checking',
    };

    try {
      const testQuery = 'what are stevie awards';
      const embedding = await openaiService.generateEmbedding(testQuery);
      const searchResults = await pineconeClient.query(embedding, 5, {
        content_type: 'kb_article',
      });

      results.tests.rag_query.status = 'passed';
      results.tests.rag_query.details = {
        query: testQuery,
        resultsFound: searchResults.length,
        topScore: searchResults[0]?.score || 0,
        hasContent: searchResults.length > 0 && !!searchResults[0]?.metadata?.chunk_text,
      };
      results.summary.passed++;

      if (searchResults.length === 0) {
        results.tests.rag_query.warning =
          'No results found - check if documents have content_type: kb_article metadata';
      }
    } catch (error: any) {
      results.tests.rag_query.status = 'failed';
      results.tests.rag_query.error = error.message;
      results.summary.failed++;
    }

    // Overall status
    results.overall = results.summary.failed === 0 ? 'healthy' : 'unhealthy';

    logger.info('rag_diagnostic_complete', {
      passed: results.summary.passed,
      failed: results.summary.failed,
    });

    res.json(results);
  } catch (error: any) {
    logger.error('rag_diagnostic_error', { error: error.message });
    res.status(500).json({
      error: 'Diagnostic failed',
      message: error.message,
      results,
    });
  }
});

export default router;
