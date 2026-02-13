import { Pinecone } from '@pinecone-database/pinecone';
import logger from '../utils/logger';
import { createCircuitBreaker } from '../utils/circuitBreaker';

const PINECONE_TIMEOUT_MS = parseInt(process.env.PINECONE_TIMEOUT_MS || '15000', 10);

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/** Circuit breaker for Pinecone (fail fast when open). */
const pineconeBreaker = createCircuitBreaker(
  (fn: () => Promise<any>) => fn(),
  async () => {
    throw new Error('Vector search temporarily unavailable. Please try again shortly.');
  }
);

/**
 * Pinecone Client Service
 *
 * Handles vector operations for document Q&A system.
 * Timeouts and circuit breaker prevent one slow/failing call from hanging the process (industry practice at scale).
 */
export class PineconeClient {
  private client: Pinecone;
  private indexName: string;

  constructor() {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error('PINECONE_API_KEY is required');
    }

    this.indexName = process.env.PINECONE_INDEX_NAME || 'stevie-kb-documents';

    this.client = new Pinecone({
      apiKey: apiKey,
    });

    logger.info('pinecone_client_initialized', { indexName: this.indexName, timeoutMs: PINECONE_TIMEOUT_MS });
  }

  /**
   * Get Pinecone index
   */
  private getIndex() {
    return this.client.index(this.indexName);
  }

  private async upsertImpl(vectors: Array<{
    id: string;
    values: number[];
    metadata: Record<string, any>;
  }>): Promise<void> {
    const index = this.getIndex();
    await index.upsert(vectors as any);
    logger.info('pinecone_upsert_success', { count: vectors.length, ids: vectors.map((v) => v.id) });
  }

  /**
   * Upsert vectors to Pinecone (with timeout and circuit breaker).
   */
  async upsert(vectors: Array<{
    id: string;
    values: number[];
    metadata: Record<string, any>;
  }>): Promise<void> {
    const run = () => withTimeout(this.upsertImpl(vectors), PINECONE_TIMEOUT_MS, 'Pinecone.upsert');
    try {
      await pineconeBreaker.fire(run);
    } catch (error: any) {
      logger.error('pinecone_upsert_error', { error: error.message, count: vectors.length });
      throw new Error(`Failed to upsert vectors: ${error.message}`);
    }
  }

  private async queryImpl(
    vector: number[],
    topK: number,
    filter?: Record<string, any>
  ): Promise<Array<{ id: string; score: number; metadata: Record<string, any> }>> {
    const index = this.getIndex();
    const queryResponse = await index.query({
      vector,
      topK,
      includeMetadata: true,
      filter,
    });
    const matches = queryResponse.matches || [];
    logger.info('pinecone_query_success', { topK, resultsCount: matches.length, hasFilter: !!filter });
    return matches.map((match) => ({
      id: match.id,
      score: match.score || 0,
      metadata: (match.metadata || {}) as Record<string, any>,
    }));
  }

  /**
   * Query vectors from Pinecone (with timeout and circuit breaker).
   */
  async query(
    vector: number[],
    topK: number = 5,
    filter?: Record<string, any>
  ): Promise<Array<{ id: string; score: number; metadata: Record<string, any> }>> {
    const run = () =>
      withTimeout(this.queryImpl(vector, topK, filter), PINECONE_TIMEOUT_MS, 'Pinecone.query');
    try {
      return await pineconeBreaker.fire(run);
    } catch (error: any) {
      logger.error('pinecone_query_error', { error: error.message, topK });
      throw new Error(`Failed to query vectors: ${error.message}`);
    }
  }

  /**
   * Delete vectors from Pinecone by IDs (with timeout and circuit breaker).
   */
  async deleteByIds(ids: string[]): Promise<void> {
    const run = () =>
      withTimeout(
        (async () => {
          const index = this.getIndex();
          await index.deleteMany(ids);
          logger.info('pinecone_delete_success', { count: ids.length, ids });
        })(),
        PINECONE_TIMEOUT_MS,
        'Pinecone.deleteByIds'
      );
    try {
      await pineconeBreaker.fire(run);
    } catch (error: any) {
      logger.error('pinecone_delete_error', { error: error.message, count: ids.length });
      throw new Error(`Failed to delete vectors: ${error.message}`);
    }
  }

  /**
   * Delete vectors from Pinecone by metadata filter (with timeout and circuit breaker).
   */
  async deleteByFilter(filter: Record<string, any>): Promise<void> {
    const run = () =>
      withTimeout(
        (async () => {
          const index = this.getIndex();
          await index.deleteMany(filter);
          logger.info('pinecone_delete_by_filter_success', { filter });
        })(),
        PINECONE_TIMEOUT_MS,
        'Pinecone.deleteByFilter'
      );
    try {
      await pineconeBreaker.fire(run);
    } catch (error: any) {
      logger.error('pinecone_delete_by_filter_error', { error: error.message, filter });
      throw new Error(`Failed to delete vectors by filter: ${error.message}`);
    }
  }

  /**
   * Get index stats (with timeout and circuit breaker).
   */
  async getStats(): Promise<any> {
    const run = () =>
      withTimeout(
        (async () => {
          const index = this.getIndex();
          const stats = await index.describeIndexStats();
          logger.info('pinecone_stats_retrieved', { stats });
          return stats;
        })(),
        PINECONE_TIMEOUT_MS,
        'Pinecone.getStats'
      );
    try {
      return await pineconeBreaker.fire(run);
    } catch (error: any) {
      logger.error('pinecone_stats_error', { error: (error as Error).message });
      throw new Error(`Failed to get index stats: ${(error as Error).message}`);
    }
  }
}

// Export singleton instance
export const pineconeClient = new PineconeClient();
