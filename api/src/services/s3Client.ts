import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import logger from '../utils/logger';

/**
 * S3 Client Service
 * 
 * Handles file storage operations for document management.
 * Stores raw files (PDF, DOCX, etc.) in AWS S3.
 * 
 * NOT authoritative - PostgreSQL is the source of truth.
 * S3 is rebuildable and disposable.
 */
export class S3Service {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const region = process.env.AWS_REGION || 'us-east-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      logger.warn('s3_credentials_missing', {
        message: 'AWS credentials not configured. S3 operations will fail.',
      });
    }

    this.bucket = process.env.S3_BUCKET_NAME || 'stevie-awards-documents';

    this.client = new S3Client({
      region,
      credentials: accessKeyId && secretAccessKey ? {
        accessKeyId,
        secretAccessKey,
      } : undefined,
    });

    logger.info('s3_client_initialized', { bucket: this.bucket, region });
  }

  /**
   * Upload a document file to S3
   */
  async uploadDocument(
    documentId: string,
    fileBuffer: Buffer,
    contentType: string,
    originalFilename: string
  ): Promise<string> {
    try {
      // Determine file extension
      const ext = originalFilename.split('.').pop() || 'bin';
      const key = `kb_articles/${documentId}.${ext}`;

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
        Metadata: {
          'original-filename': originalFilename,
          'document-id': documentId,
        },
      });

      await this.client.send(command);

      logger.info('s3_document_uploaded', {
        documentId,
        key,
        size: fileBuffer.length,
        contentType,
      });

      return key;
    } catch (error: any) {
      logger.error('s3_upload_error', {
        documentId,
        error: error.message,
      });
      throw new Error(`Failed to upload document to S3: ${error.message}`);
    }
  }

  /**
   * Generate presigned URL for document download
   * URL expires after 7 days (default)
   */
  async getPresignedUrl(s3Key: string, expiresIn: number = 604800): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
      });

      const url = await getSignedUrl(this.client, command, { expiresIn });

      logger.info('s3_presigned_url_generated', {
        key: s3Key,
        expiresIn,
      });

      return url;
    } catch (error: any) {
      logger.error('s3_presigned_url_error', {
        key: s3Key,
        error: error.message,
      });
      throw new Error(`Failed to generate presigned URL: ${error.message}`);
    }
  }

  /**
   * Delete a document from S3
   */
  async deleteDocument(s3Key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
      });

      await this.client.send(command);

      logger.info('s3_document_deleted', { key: s3Key });
    } catch (error: any) {
      logger.error('s3_delete_error', {
        key: s3Key,
        error: error.message,
      });
      throw new Error(`Failed to delete document from S3: ${error.message}`);
    }
  }

  /**
   * Check if a document exists in S3
   */
  async documentExists(s3Key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
      });

      await this.client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound') {
        return false;
      }
      logger.error('s3_head_error', {
        key: s3Key,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Health check - verify S3 access
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Try to list objects (just check access)
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: 'health-check-dummy',
      });

      await this.client.send(command);
      return true;
    } catch (error: any) {
      // NotFound is expected for health check
      if (error.name === 'NotFound') {
        return true;
      }
      logger.error('s3_health_check_failed', { error: error.message });
      return false;
    }
  }
}

// Export singleton instance
export const s3Service = new S3Service();
