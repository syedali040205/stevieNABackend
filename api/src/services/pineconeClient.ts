import { Pinecone } from '@pinecone-database/pinecone';
import logger from '../utils/logger';

/**
 * Pinecone Client Service
 * 
 * Handles vector operations for document Q&A system.
 * Manages upsert, query, and delete operations on Pinecone index.
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

    logger.info('pinecone_client_initialized', { indexName: this.indexName });
  }

  /**
   * Get Pinecone index
   */
  private getIndex() {
    return this.client.index(this.indexName);
  }

  /**
   * Upsert vectors to Pinecone
   */
  async upsert(vectors: Array<{
    id: string;
    values: number[];
    metadata: Record<string, any>;
  }>): Promise<void> {
    try {
      const index = this.getIndex();
      // Pinecone SDK expects records array wrapped in an object
      await index.upsert(vectors as any);
      
      logger.info('pinecone_upsert_success', { 
        count: vectors.length,
        ids: vectors.map(v => v.id)
      });
    } catch (error: any) {
      logger.error('pinecone_upsert_error', { 
        error: error.message,
        count: vectors.length
      });
      throw new Error(`Failed to upsert vectors: ${error.message}`);
    }
  }

  /**
   * Query vectors from Pinecone
   */
  async query(
    vector: number[],
    topK: number = 5,
    filter?: Record<string, any>
  ): Promise<Array<{
    id: string;
    score: number;
    metadata: Record<string, any>;
  }>> {
    try {
      const index = this.getIndex();
      const queryResponse = await index.query({
        vector: vector,
        topK: topK,
        includeMetadata: true,
        filter: filter,
      });

      const matches = queryResponse.matches || [];
      
      logger.info('pinecone_query_success', { 
        topK,
        resultsCount: matches.length,
        hasFilter: !!filter
      });

      return matches.map(match => ({
        id: match.id,
        score: match.score || 0,
        metadata: (match.metadata || {}) as Record<string, any>,
      }));
    } catch (error: any) {
      logger.error('pinecone_query_error', { 
        error: error.message,
        topK
      });
      throw new Error(`Failed to query vectors: ${error.message}`);
    }
  }

  /**
   * Delete vectors from Pinecone by IDs
   */
  async deleteByIds(ids: string[]): Promise<void> {
    try {
      const index = this.getIndex();
      await index.deleteMany(ids);
      
      logger.info('pinecone_delete_success', { 
        count: ids.length,
        ids
      });
    } catch (error: any) {
      logger.error('pinecone_delete_error', { 
        error: error.message,
        count: ids.length
      });
      throw new Error(`Failed to delete vectors: ${error.message}`);
    }
  }

  /**
   * Delete vectors from Pinecone by metadata filter
   */
  async deleteByFilter(filter: Record<string, any>): Promise<void> {
    try {
      const index = this.getIndex();
      await index.deleteMany(filter);
      
      logger.info('pinecone_delete_by_filter_success', { filter });
    } catch (error: any) {
      logger.error('pinecone_delete_by_filter_error', { 
        error: error.message,
        filter
      });
      throw new Error(`Failed to delete vectors by filter: ${error.message}`);
    }
  }

  /**
   * Get index stats
   */
  async getStats(): Promise<any> {
    try {
      const index = this.getIndex();
      const stats = await index.describeIndexStats();
      
      logger.info('pinecone_stats_retrieved', { stats });
      return stats;
    } catch (error: any) {
      logger.error('pinecone_stats_error', { error: error.message });
      throw new Error(`Failed to get index stats: ${error.message}`);
    }
  }
}

// Export singleton instance
export const pineconeClient = new PineconeClient();
