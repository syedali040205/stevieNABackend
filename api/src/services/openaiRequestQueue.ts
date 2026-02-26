import PQueue from 'p-queue';
import logger from '../utils/logger';

/**
 * Priority levels for OpenAI requests
 * Lower number = higher priority
 */
export enum QueuePriority {
  INTAKE = 1,           // Highest priority - user waiting for next question
  QA = 2,               // Medium priority - Q&A responses
  RECOMMENDATION = 2,   // Medium priority - recommendation generation
  EXPLANATION = 3,      // Lowest priority - explanation generation (can be slower)
}

/**
 * Statistics about the queue state
 */
export interface QueueStats {
  size: number;      // Number of queued requests
  pending: number;   // Number of executing requests
  concurrency: number;
  rateLimit: number;
}

/**
 * OpenAI Request Queue Manager
 * 
 * Manages concurrent OpenAI API requests with rate limiting and priority-based scheduling.
 * Prevents rate limit errors by controlling concurrency and request rate.
 * 
 * Features:
 * - Max 10 concurrent requests
 * - Max 50 requests per second
 * - Priority-based scheduling (intake > QA/recommendations > explanations)
 * - Promise-based API for easy integration
 */
class OpenAIRequestQueue {
  private queue: PQueue;
  private readonly MAX_CONCURRENT: number;
  private readonly RATE_LIMIT_PER_SECOND: number;

  constructor() {
    // Read from environment variables with fallback to defaults
    this.MAX_CONCURRENT = parseInt(process.env.OPENAI_QUEUE_CONCURRENCY || '10', 10);
    this.RATE_LIMIT_PER_SECOND = parseInt(process.env.OPENAI_QUEUE_RATE_LIMIT || '50', 10);

    this.queue = new PQueue({
      concurrency: this.MAX_CONCURRENT,
      interval: 1000,           // 1 second window
      intervalCap: this.RATE_LIMIT_PER_SECOND,
    });

    logger.info('OpenAI Request Queue initialized', {
      maxConcurrent: this.MAX_CONCURRENT,
      rateLimit: this.RATE_LIMIT_PER_SECOND,
    });
  }

  /**
   * Enqueue a function to be executed with rate limiting and priority
   * 
   * @param fn - Async function to execute (typically an OpenAI API call)
   * @param priority - Priority level (default: QA)
   * @returns Promise that resolves with the function's return value
   */
  async enqueue<T>(
    fn: () => Promise<T>,
    priority: QueuePriority = QueuePriority.QA
  ): Promise<T> {
    const result = await this.queue.add(fn, { priority });
    if (result === undefined) {
      throw new Error('Queue returned undefined result');
    }
    return result as T;
  }

  /**
   * Get current queue statistics
   * 
   * @returns Queue stats including size, pending requests, and limits
   */
  getStats(): QueueStats {
    return {
      size: this.queue.size,
      pending: this.queue.pending,
      concurrency: this.MAX_CONCURRENT,
      rateLimit: this.RATE_LIMIT_PER_SECOND,
    };
  }

  /**
   * Clear all pending requests from the queue
   * Note: Does not cancel already executing requests
   */
  clear(): void {
    this.queue.clear();
    logger.warn('OpenAI Request Queue cleared');
  }

  /**
   * Pause the queue (stop processing new requests)
   */
  pause(): void {
    this.queue.pause();
    logger.warn('OpenAI Request Queue paused');
  }

  /**
   * Resume the queue (continue processing requests)
   */
  start(): void {
    this.queue.start();
    logger.info('OpenAI Request Queue resumed');
  }
}

// Export singleton instance
export const openaiRequestQueue = new OpenAIRequestQueue();
