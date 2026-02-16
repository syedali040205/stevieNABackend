import Redis from 'ioredis';
import crypto from 'crypto';
import logger from '../utils/logger';

/**
 * Redis Cache Manager
 * 
 * Handles caching for:
 * - OpenAI embeddings (7 day TTL)
 * - KB search results (1 hour TTL)
 * - Session data (1 hour TTL)
 * - Rate limiting (60 second windows)
 * 
 * GRACEFUL DEGRADATION: If Redis is unavailable, all operations return null/false
 * and the system continues without caching.
 */
export class CacheManager {
  private redis: Redis | null = null;
  private defaultTTL: number = 3600; // 1 hour default
  private redisAvailable: boolean = false;

  // TTL constants
  private readonly EMBEDDING_TTL = 7 * 24 * 3600; // 7 days
  private readonly SESSION_TTL = 3600; // 1 hour
  private readonly RATE_LIMIT_WINDOW = 60; // 60 seconds

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const redisPassword = process.env.REDIS_PASSWORD || '';
    const redisDb = parseInt(process.env.REDIS_DB || '0', 10);

    // Skip Redis initialization if URL is not set
    // Allow localhost for development
    if (!process.env.REDIS_URL) {
      logger.info('redis_disabled', { reason: 'REDIS_URL not set' });
      this.redisAvailable = false;
      return;
    }

    const connectTimeoutMs = parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS || '10000', 10);
    const commandTimeoutMs = parseInt(process.env.REDIS_COMMAND_TIMEOUT_MS || '5000', 10);

    try {
      this.redis = new Redis(redisUrl, {
        password: redisPassword || undefined,
        db: redisDb,
        connectTimeout: connectTimeoutMs,
        commandTimeout: commandTimeoutMs,
        retryStrategy: (times) => {
          // Stop retrying after 3 attempts
          if (times > 3) {
            logger.warn('redis_max_retries_reached', { attempts: times });
            return null;
          }
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        lazyConnect: true, // Don't connect immediately
      });

      this.redis.on('connect', () => {
        this.redisAvailable = true;
        logger.info('redis_connected', { url: redisUrl });
      });

      this.redis.on('error', (error) => {
        this.redisAvailable = false;
        logger.error('redis_error', { error: error.message });
      });

      // Try to connect
      this.redis.connect().catch((error) => {
        this.redisAvailable = false;
        logger.warn('redis_connection_failed', { error: error.message });
      });
    } catch (error: any) {
      this.redisAvailable = false;
      logger.warn('redis_initialization_failed', { error: error.message });
    }
  }

  /**
   * Generate cache key for embeddings
   * Format: emb:{model}:{sha256(normalized_text)}
   */
  private getEmbeddingKey(text: string, model: string): string {
    const normalized = text.trim().toLowerCase();
    const hash = crypto.createHash('sha256').update(normalized).digest('hex');
    return `emb:${model}:${hash}`;
  }

  /**
   * Get cached embedding
   */
  async getEmbedding(text: string, model: string): Promise<number[] | null> {
    if (!this.redisAvailable || !this.redis) {
      return null;
    }

    const key = this.getEmbeddingKey(text, model);
    
    try {
      const value = await this.redis.get(key);
      if (!value) {
        return null;
      }
      const embedding = JSON.parse(value) as number[];
      logger.info('embedding_cache_hit', { 
        text_length: text.length,
        model,
        key_hash: key.substring(0, 20) 
      });
      return embedding;
    } catch (error: any) {
      logger.error('embedding_cache_get_error', { error: error.message });
      return null;
    }
  }

  /**
   * Cache embedding with 7 day TTL
   */
  async setEmbedding(text: string, model: string, embedding: number[]): Promise<boolean> {
    if (!this.redisAvailable || !this.redis) {
      return false;
    }

    const key = this.getEmbeddingKey(text, model);
    
    try {
      const serialized = JSON.stringify(embedding);
      await this.redis.setex(key, this.EMBEDDING_TTL, serialized);
      logger.debug('embedding_cached', { 
        text_length: text.length,
        model,
        dimension: embedding.length 
      });
      return true;
    } catch (error: any) {
      logger.error('embedding_cache_set_error', { error: error.message });
      return false;
    }
  }

  /**
   * Rate limiting using Redis atomic operations
   * Key format: rate:{ip}:{route}
   * Returns: { allowed: boolean, remaining: number, resetAt: number }
   */
  async checkRateLimit(
    ip: string, 
    route: string, 
    limit: number = 30
  ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    if (!this.redisAvailable || !this.redis) {
      // Graceful degradation: allow request if Redis unavailable
      return { allowed: true, remaining: limit, resetAt: Date.now() + this.RATE_LIMIT_WINDOW * 1000 };
    }

    const key = `rate:${ip}:${route}`;
    
    try {
      // Atomic increment
      const count = await this.redis.incr(key);
      
      // Set TTL on first request
      if (count === 1) {
        await this.redis.expire(key, this.RATE_LIMIT_WINDOW);
      }
      
      const ttl = await this.redis.ttl(key);
      const resetAt = Date.now() + (ttl * 1000);
      const remaining = Math.max(0, limit - count);
      const allowed = count <= limit;

      if (!allowed) {
        logger.warn('rate_limit_exceeded', { ip, route, count, limit });
      }

      return { allowed, remaining, resetAt };
    } catch (error: any) {
      logger.error('rate_limit_check_error', { error: error.message });
      // Graceful degradation: allow request on error
      return { allowed: true, remaining: limit, resetAt: Date.now() + this.RATE_LIMIT_WINDOW * 1000 };
    }
  }

  /**
   * Session management
   * Key format: sess:{sessionId}
   */
  async getSession<T>(sessionId: string): Promise<T | null> {
    if (!this.redisAvailable || !this.redis) {
      return null;
    }

    const key = `sess:${sessionId}`;
    
    try {
      const value = await this.redis.get(key);
      if (!value) {
        return null;
      }
      return JSON.parse(value) as T;
    } catch (error: any) {
      logger.error('session_get_error', { sessionId, error: error.message });
      return null;
    }
  }

  async setSession(sessionId: string, data: any): Promise<boolean> {
    if (!this.redisAvailable || !this.redis) {
      return false;
    }

    const key = `sess:${sessionId}`;
    
    try {
      const serialized = JSON.stringify(data);
      await this.redis.setex(key, this.SESSION_TTL, serialized);
      return true;
    } catch (error: any) {
      logger.error('session_set_error', { sessionId, error: error.message });
      return false;
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    if (!this.redisAvailable || !this.redis) {
      return false;
    }

    const key = `sess:${sessionId}`;
    
    try {
      await this.redis.del(key);
      return true;
    } catch (error: any) {
      logger.error('session_delete_error', { sessionId, error: error.message });
      return false;
    }
  }

  /**
   * Get cached value by key (generic)
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.redisAvailable || !this.redis) {
      return null;
    }
    
    try {
      const value = await this.redis.get(key);
      if (!value) {
        return null;
      }
      return JSON.parse(value) as T;
    } catch (error: any) {
      logger.error('cache_get_error', { key, error: error.message });
      return null;
    }
  }

  /**
   * Set cached value with TTL (generic)
   */
  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    if (!this.redisAvailable || !this.redis) {
      return false;
    }
    
    try {
      const serialized = JSON.stringify(value);
      const expiry = ttl || this.defaultTTL;
      await this.redis.setex(key, expiry, serialized);
      return true;
    } catch (error: any) {
      logger.error('cache_set_error', { key, error: error.message });
      return false;
    }
  }

  /**
   * Delete cached value
   */
  async delete(key: string): Promise<boolean> {
    if (!this.redisAvailable || !this.redis) {
      return false;
    }
    
    try {
      await this.redis.del(key);
      return true;
    } catch (error: any) {
      logger.error('cache_delete_error', { key, error: error.message });
      return false;
    }
  }

  /**
   * Delete all keys matching pattern.
   * Uses SCAN (cursor-based) instead of KEYS to avoid blocking Redis at scale.
   */
  async deletePattern(pattern: string): Promise<number> {
    if (!this.redisAvailable || !this.redis) {
      return 0;
    }
    
    try {
      const keys: string[] = [];
      const stream = this.redis.scanStream({
        match: pattern,
        count: 100,
      });
      for await (const batch of stream) {
        keys.push(...(batch as string[]));
      }
      if (keys.length === 0) {
        return 0;
      }
      // Delete in chunks to avoid huge DEL
      const chunkSize = 500;
      for (let i = 0; i < keys.length; i += chunkSize) {
        await this.redis.del(...keys.slice(i, i + chunkSize));
      }
      return keys.length;
    } catch (error: any) {
      logger.error('cache_delete_pattern_error', { pattern, error: error.message });
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.redisAvailable || !this.redis) {
      return false;
    }
    
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error: any) {
      logger.error('cache_exists_error', { key, error: error.message });
      return false;
    }
  }

  /**
   * Get remaining TTL for key
   */
  async ttl(key: string): Promise<number> {
    if (!this.redisAvailable || !this.redis) {
      return -1;
    }
    
    try {
      return await this.redis.ttl(key);
    } catch (error: any) {
      logger.error('cache_ttl_error', { key, error: error.message });
      return -1;
    }
  }

  /**
   * Atomic increment. Returns new value after increment.
   * Used for rate limiting (fixed window).
   */
  async incr(key: string): Promise<number> {
    if (!this.redisAvailable || !this.redis) {
      return 0;
    }
    
    try {
      return await this.redis.incr(key);
    } catch (error: any) {
      logger.error('cache_incr_error', { key, error: error.message });
      return 0;
    }
  }

  /**
   * Set TTL on a key (seconds).
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    if (!this.redisAvailable || !this.redis) {
      return false;
    }
    
    try {
      const result = await this.redis.expire(key, seconds);
      return !!result;
    } catch (error: any) {
      logger.error('cache_expire_error', { key, error: error.message });
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    if (!this.redisAvailable || !this.redis) {
      return false;
    }
    
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error: any) {
      logger.error('redis_health_check_failed', { error: error.message });
      return false;
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.redisAvailable;
  }
}

// Export singleton instance
export const cacheManager = new CacheManager();
