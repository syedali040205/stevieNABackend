import Redis from 'ioredis';
import logger from '../utils/logger';

/**
 * Redis Cache Manager
 * 
 * Handles caching for FAQ responses and document metadata.
 * Uses Redis for fast in-memory caching with TTL support.
 */
export class CacheManager {
  private redis: Redis;
  private defaultTTL: number = 3600; // 1 hour default

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const redisPassword = process.env.REDIS_PASSWORD || '';
    const redisDb = parseInt(process.env.REDIS_DB || '0', 10);

    this.redis = new Redis(redisUrl, {
      password: redisPassword || undefined,
      db: redisDb,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    this.redis.on('connect', () => {
      logger.info('redis_connected', { url: redisUrl });
    });

    this.redis.on('error', (error) => {
      logger.error('redis_error', { error: error.message });
    });
  }

  /**
   * Get cached value by key
   */
  async get<T>(key: string): Promise<T | null> {
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
    try {
      await this.redis.del(key);
      return true;
    } catch (error: any) {
      logger.error('cache_delete_error', { key, error: error.message });
      return false;
    }
  }

  /**
   * Delete all keys matching pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }
      await this.redis.del(...keys);
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
    try {
      return await this.redis.ttl(key);
    } catch (error: any) {
      logger.error('cache_ttl_error', { key, error: error.message });
      return -1;
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
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
