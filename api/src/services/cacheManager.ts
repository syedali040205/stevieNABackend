import Redis from 'ioredis';
import logger from '../utils/logger';

/**
 * Redis Cache Manager
 * 
 * Handles caching for FAQ responses and document metadata.
 * Uses Redis for fast in-memory caching with TTL support.
 * 
 * GRACEFUL DEGRADATION: If Redis is unavailable, all operations return null/false
 * and the system continues without caching.
 */
export class CacheManager {
  private redis: Redis | null = null;
  private defaultTTL: number = 3600; // 1 hour default
  private redisAvailable: boolean = false;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const redisPassword = process.env.REDIS_PASSWORD || '';
    const redisDb = parseInt(process.env.REDIS_DB || '0', 10);

    // Skip Redis initialization if URL is not set or is localhost (production without Redis)
    if (!process.env.REDIS_URL || redisUrl.includes('localhost')) {
      logger.info('redis_disabled', { reason: 'REDIS_URL not set or localhost' });
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
   * Get cached value by key
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
   * Set cached value with TTL
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
}

// Export singleton instance
export const cacheManager = new CacheManager();
