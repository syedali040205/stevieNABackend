import { getSupabaseClient } from '../config/supabase';
import { pineconeClient } from './pineconeClient';
import { s3Service } from './s3Client';
import { cacheManager } from './cacheManager';
import { openaiService } from './openaiService';
import logger from '../utils/logger';

/**
 * Document Manager Service
 * 
 * Manages document lifecycle: ingestion, chunking, embedding, and deletion.
 * Coordinates between PostgreSQL (metadata), Pinecone (vectors), and S3 (files).
 */
export class DocumentManager {
  private supabase = getSupabaseClient();

  /**
   * Ingest a document: chunk, embed, and store
   * Supports both text content and file uploads
   */
  async ingestDocument(params: {
    title: string;
    content: string;
    program?: string;
    category?: string;
    metadata?: Record<string, any>;
    file?: {
      buffer: Buffer;
      contentType: string;
      originalFilename: string;
    };
  }): Promise<string> {
    const { title, content, program, category, metadata, file } = params;

    try {
      logger.info('document_ingestion_started', { title, program, hasFile: !!file });

      // Step 1: Create document record in PostgreSQL
      const documentMetadata: Record<string, any> = metadata || {};

      // If file provided, upload to S3 first
      if (file) {
        try {
          const s3Key = await s3Service.uploadDocument(
            '', // Will use document ID after creation
            file.buffer,
            file.contentType,
            file.originalFilename
          );

          documentMetadata.s3_key = s3Key;
          documentMetadata.original_filename = file.originalFilename;
          documentMetadata.file_size = file.buffer.length;
          documentMetadata.content_type_file = file.contentType;

          logger.info('document_uploaded_to_s3', { s3_key: s3Key });
        } catch (s3Error: any) {
          logger.error('s3_upload_failed_continuing', { error: s3Error.message });
          // Continue without S3 - not critical for ingestion
        }
      }

      const { data: document, error: dbError } = await this.supabase
        .from('documents')
        .insert({
          title,
          content,
          content_type: 'kb_article',
          program: program || null,
          metadata: documentMetadata,
        })
        .select()
        .single();

      if (dbError || !document) {
        throw new Error(`Failed to create document: ${dbError?.message}`);
      }

      logger.info('document_created_in_db', { documentId: document.id });

      // Step 2: If S3 upload happened with temp ID, update with real document ID
      if (file && documentMetadata.s3_key) {
        try {
          const ext = file.originalFilename.split('.').pop() || 'bin';
          const newS3Key = `kb_articles/${document.id}.${ext}`;

          // Re-upload with correct document ID
          await s3Service.uploadDocument(
            document.id,
            file.buffer,
            file.contentType,
            file.originalFilename
          );

          // Update metadata with correct S3 key
          await this.supabase
            .from('documents')
            .update({
              metadata: {
                ...documentMetadata,
                s3_key: newS3Key,
              },
            })
            .eq('id', document.id);

          logger.info('s3_key_updated', { documentId: document.id, s3_key: newS3Key });
        } catch (s3Error: any) {
          logger.error('s3_key_update_failed', { error: s3Error.message });
          // Non-critical - document still functional
        }
      }

      // Step 3: Chunk the document
      const chunks = await this.chunkDocument(content, {
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      logger.info('document_chunked', { 
        documentId: document.id,
        chunkCount: chunks.length 
      });

      // Step 4: Generate embeddings for chunks
      const embeddings = await this.generateEmbeddings(chunks);

      logger.info('embeddings_generated', { 
        documentId: document.id,
        embeddingCount: embeddings.length 
      });

      // Step 5: Upsert vectors to Pinecone
      const vectors = embeddings.map((embedding, index) => ({
        id: `${document.id}_chunk_${index}`,
        values: embedding,
        metadata: {
          document_id: document.id,
          title: title,
          chunk_index: index,
          chunk_text: chunks[index],
          program: program || 'general',
          category: category || 'general',
          created_at: document.created_at,
          ...metadata,
        },
      }));

      await pineconeClient.upsert(vectors);

      logger.info('document_ingestion_complete', { 
        documentId: document.id,
        vectorCount: vectors.length 
      });

      // Invalidate KB search cache since new content was added
      await this.invalidateKBCache();

      return document.id;
    } catch (error: any) {
      logger.error('document_ingestion_error', { 
        title,
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Failed to ingest document: ${error.message}`);
    }
  }

  /**
   * Delete a document (soft delete in DB, hard delete in Pinecone and S3)
   */
  async deleteDocument(documentId: string, deletedBy?: string, reason?: string): Promise<void> {
    try {
      logger.info('document_deletion_started', { documentId });

      // Step 1: Get document to retrieve S3 key
      const { data: document, error: getError } = await this.supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (getError || !document) {
        throw new Error(`Document not found: ${getError?.message}`);
      }

      // Step 2: Soft delete in PostgreSQL
      const { error: dbError } = await this.supabase
        .from('documents')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: deletedBy || null,
          deletion_reason: reason || null,
        })
        .eq('id', documentId);

      if (dbError) {
        throw new Error(`Failed to soft delete document: ${dbError.message}`);
      }

      logger.info('document_soft_deleted', { documentId });

      // Step 3: Delete vectors from Pinecone (async, non-blocking)
      try {
        await pineconeClient.deleteByFilter({ document_id: documentId });
        logger.info('pinecone_vectors_deleted', { documentId });
      } catch (pineconeError: any) {
        logger.error('pinecone_deletion_failed', {
          documentId,
          error: pineconeError.message,
        });
        // Non-critical - PostgreSQL is source of truth
      }

      // Step 4: Delete file from S3 (async, non-blocking)
      const s3Key = document.metadata?.s3_key;
      if (s3Key) {
        try {
          await s3Service.deleteDocument(s3Key);
          logger.info('s3_document_deleted', { documentId, s3_key: s3Key });
        } catch (s3Error: any) {
          logger.error('s3_deletion_failed', {
            documentId,
            s3_key: s3Key,
            error: s3Error.message,
          });
          // Non-critical - PostgreSQL is source of truth
        }
      }

      logger.info('document_deletion_complete', { documentId });

      // Invalidate KB search cache since content was removed
      await this.invalidateKBCache();
    } catch (error: any) {
      logger.error('document_deletion_error', { 
        documentId,
        error: error.message 
      });
      throw new Error(`Failed to delete document: ${error.message}`);
    }
  }

  /**
   * Search documents using Pinecone vector similarity
   */
  async searchDocuments(params: {
    query: string;
    topK?: number;
    program?: string;
    category?: string;
  }): Promise<Array<{
    documentId: string;
    title: string;
    chunkText: string;
    score: number;
    program: string;
    category: string;
  }>> {
    const { query, topK = 5, program, category } = params;

    try {
      logger.info('document_search_started', { query, topK, program, category });

      // Generate embedding for query
      const queryEmbedding = await this.generateEmbedding(query);

      // Build filter
      const filter: Record<string, any> = {};
      if (program) {
        filter.program = program;
      }
      if (category) {
        filter.category = category;
      }

      // Query Pinecone
      const results = await pineconeClient.query(
        queryEmbedding,
        topK,
        Object.keys(filter).length > 0 ? filter : undefined
      );

      // Filter out deleted documents
      const documentIds = [...new Set(results.map(r => r.metadata.document_id))];
      const { data: documents, error: dbError } = await this.supabase
        .from('documents')
        .select('id, deleted_at')
        .in('id', documentIds);

      if (dbError) {
        logger.error('document_validation_error', { error: dbError.message });
      }

      const deletedIds = new Set(
        (documents || [])
          .filter(d => d.deleted_at !== null)
          .map(d => d.id)
      );

      const filteredResults = results
        .filter(r => !deletedIds.has(r.metadata.document_id))
        .map(r => ({
          documentId: r.metadata.document_id,
          title: r.metadata.title,
          chunkText: r.metadata.chunk_text,
          score: r.score,
          program: r.metadata.program || 'general',
          category: r.metadata.category || 'general',
        }));

      logger.info('document_search_complete', { 
        resultsCount: filteredResults.length 
      });

      return filteredResults;
    } catch (error: any) {
      logger.error('document_search_error', { 
        query,
        error: error.message 
      });
      throw new Error(`Failed to search documents: ${error.message}`);
    }
  }

  /**
   * Chunk document into smaller pieces
   */
  private async chunkDocument(
    text: string,
    options: { chunkSize: number; chunkOverlap: number }
  ): Promise<string[]> {
    const { chunkSize, chunkOverlap } = options;
    const chunks: string[] = [];
    
    // Simple sentence-aware chunking
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        
        // Add overlap by keeping last few words
        const words = currentChunk.split(' ');
        const overlapWords = Math.floor(chunkOverlap / 5); // Approximate words
        currentChunk = words.slice(-overlapWords).join(' ') + ' ' + sentence;
      } else {
        currentChunk += sentence;
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Generate embeddings for multiple texts
   */
  private async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      return await openaiService.generateEmbeddings(texts);
    } catch (error: any) {
      logger.error('batch_embedding_generation_error', { 
        error: error.message 
      });
      throw new Error(`Failed to generate embeddings: ${error.message}`);
    }
  }

  /**
   * Generate embedding for a single text
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      return await openaiService.generateEmbedding(text);
    } catch (error: any) {
      logger.error('embedding_generation_error', { 
        error: error.message 
      });
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Get document by ID
   */
  async getDocument(documentId: string): Promise<any> {
    try {
      const { data, error } = await this.supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .is('deleted_at', null)
        .single();

      if (error) {
        throw new Error(`Failed to get document: ${error.message}`);
      }

      return data;
    } catch (error: any) {
      logger.error('get_document_error', { 
        documentId,
        error: error.message 
      });
      return null;
    }
  }

  /**
   * Get presigned URL for document download
   */
  async getDocumentDownloadUrl(documentId: string): Promise<string | null> {
    try {
      const document = await this.getDocument(documentId);
      if (!document) {
        return null;
      }

      const s3Key = document.metadata?.s3_key;
      if (!s3Key) {
        return null;
      }

      const url = await s3Service.getPresignedUrl(s3Key);
      return url;
    } catch (error: any) {
      logger.error('get_download_url_error', {
        documentId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * List all documents
   */
  async listDocuments(params?: {
    program?: string;
    category?: string;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    try {
      let query = this.supabase
        .from('documents')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (params?.program) {
        query = query.eq('program', params.program);
      }

      if (params?.limit) {
        query = query.limit(params.limit);
      }

      if (params?.offset) {
        query = query.range(params.offset, params.offset + (params.limit || 10) - 1);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to list documents: ${error.message}`);
      }

      return data || [];
    } catch (error: any) {
      logger.error('list_documents_error', { error: error.message });
      return [];
    }
  }

  /**
   * Invalidate KB search cache
   * Called when documents are added, updated, or deleted
   */
  private async invalidateKBCache(): Promise<void> {
    try {
      const pattern = 'kb_search:*';
      const deletedCount = await cacheManager.deletePattern(pattern);
      logger.info('kb_cache_invalidated_by_document_change', { count: deletedCount });
    } catch (error: any) {
      logger.error('kb_cache_invalidation_error', { error: error.message });
      // Non-critical - don't fail the operation
    }
  }
}

// Export singleton instance
export const documentManager = new DocumentManager();
