import { getSupabaseClient } from '../config/supabase';
import logger from '../utils/logger';

/**
 * Award Search Cache Manager
 * 
 * Handles caching for Award Search Assistant using Supabase.
 * Stores crawled data from stevieawards.com with 7-day TTL.
 * 
 * Features:
 * - URL-based cache keys
 * - Time-based expiration (7 days default)
 * - Stale data detection
 * - Batch retrieval for multi-source queries
 * - In-memory lock for deduplication of concurrent requests
 */

export interface CrawlResult {
  url: string;
  title: string;
  content: string;
  headings: string[];
  tables: TableData[];
  entities: ExtractedEntity[];
  metadata: {
    crawledAt: string;
    contentType: string;
    depth: number;
  };
}

export interface TableData {
  headers: string[];
  rows: string[][];
}

export interface ExtractedEntity {
  type: 'award' | 'category' | 'date' | 'price';
  value: string;
  context: string;
}

export interface CachedData {
  url: string;
  data: CrawlResult;
  cachedAt: Date;
  expiresAt: Date;
}

export class AwardSearchCacheManager {
  private defaultTTLDays: number;
  private pendingRequests: Map<string, Promise<CachedData | null>>;

  constructor(ttlDays: number = 7) {
    this.defaultTTLDays = ttlDays;
    this.pendingRequests = new Map();
  }

  /**
   * Get cached data by URL
   * Returns null if not found or expired
   */
  async get(url: string): Promise<CachedData | null> {
    // Check if there's already a pending request for this URL (deduplication)
    const pending = this.pendingRequests.get(url);
    if (pending) {
      logger.debug('award_search_cache_dedup', { url });
      return pending;
    }

    // Create new request promise
    const requestPromise = this._get(url);
    this.pendingRequests.set(url, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Clean up pending request
      this.pendingRequests.delete(url);
    }
  }

  private async _get(url: string): Promise<CachedData | null> {
    try {
      const supabase = getSupabaseClient();
      
      const { data, error } = await supabase
        .from('award_search_cache')
        .select('*')
        .eq('url', url)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned - cache miss
          logger.debug('award_search_cache_miss', { url });
          return null;
        }
        throw error;
      }

      if (!data) {
        logger.debug('award_search_cache_miss', { url });
        return null;
      }

      // Check if expired
      const expiresAt = new Date(data.expires_at);
      if (expiresAt < new Date()) {
        logger.debug('award_search_cache_expired', { url, expiresAt });
        return null;
      }

      // Update access tracking
      await this.updateAccessTracking(url);

      logger.info('award_search_cache_hit', { 
        url, 
        cachedAt: data.cached_at,
        accessCount: data.access_count + 1
      });

      return {
        url: data.url,
        data: data.data as CrawlResult,
        cachedAt: new Date(data.cached_at),
        expiresAt: new Date(data.expires_at),
      };
    } catch (error: any) {
      logger.error('award_search_cache_get_error', { 
        url, 
        error: error.message 
      });
      return null;
    }
  }

  /**
   * Store crawled data in cache with TTL
   */
  async set(url: string, data: CrawlResult, ttlDays?: number): Promise<void> {
    try {
      const supabase = getSupabaseClient();
      const ttl = ttlDays || this.defaultTTLDays;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttl * 24 * 60 * 60 * 1000);

      const { error } = await supabase
        .from('award_search_cache')
        .upsert({
          url,
          data: data as any,
          cached_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          access_count: 0,
          last_accessed_at: null,
        }, {
          onConflict: 'url'
        });

      if (error) {
        throw error;
      }

      logger.info('award_search_cache_set', { 
        url, 
        ttlDays: ttl,
        expiresAt: expiresAt.toISOString()
      });
    } catch (error: any) {
      logger.error('award_search_cache_set_error', { 
        url, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Invalidate (delete) cached data for a URL
   */
  async invalidate(url: string): Promise<void> {
    try {
      const supabase = getSupabaseClient();
      
      const { error } = await supabase
        .from('award_search_cache')
        .delete()
        .eq('url', url);

      if (error) {
        throw error;
      }

      logger.info('award_search_cache_invalidated', { url });
    } catch (error: any) {
      logger.error('award_search_cache_invalidate_error', { 
        url, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Check if cached data is stale (older than TTL)
   * Returns true if stale or not found
   */
  async isStale(url: string): Promise<boolean> {
    try {
      const supabase = getSupabaseClient();
      
      const { data, error } = await supabase
        .from('award_search_cache')
        .select('expires_at')
        .eq('url', url)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned - treat as stale
          return true;
        }
        throw error;
      }

      if (!data) {
        return true;
      }

      const expiresAt = new Date(data.expires_at);
      const isStale = expiresAt < new Date();

      logger.debug('award_search_cache_stale_check', { 
        url, 
        expiresAt: expiresAt.toISOString(),
        isStale 
      });

      return isStale;
    } catch (error: any) {
      logger.error('award_search_cache_stale_check_error', { 
        url, 
        error: error.message 
      });
      // Treat as stale on error
      return true;
    }
  }

  /**
   * Get multiple cached entries by URLs
   * Returns a Map of URL -> CachedData for found entries
   */
  async getMultiple(urls: string[]): Promise<Map<string, CachedData>> {
    const result = new Map<string, CachedData>();

    if (urls.length === 0) {
      return result;
    }

    try {
      const supabase = getSupabaseClient();
      
      const { data, error } = await supabase
        .from('award_search_cache')
        .select('*')
        .in('url', urls);

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        logger.debug('award_search_cache_multiple_miss', { 
          requestedCount: urls.length 
        });
        return result;
      }

      const now = new Date();

      for (const row of data) {
        const expiresAt = new Date(row.expires_at);
        
        // Skip expired entries
        if (expiresAt < now) {
          logger.debug('award_search_cache_expired', { 
            url: row.url, 
            expiresAt 
          });
          continue;
        }

        result.set(row.url, {
          url: row.url,
          data: row.data as CrawlResult,
          cachedAt: new Date(row.cached_at),
          expiresAt: expiresAt,
        });

        // Update access tracking (fire and forget)
        this.updateAccessTracking(row.url).catch(err => {
          logger.error('award_search_cache_access_tracking_error', { 
            url: row.url, 
            error: err.message 
          });
        });
      }

      logger.info('award_search_cache_multiple_hit', { 
        requestedCount: urls.length,
        foundCount: result.size 
      });

      return result;
    } catch (error: any) {
      logger.error('award_search_cache_multiple_get_error', { 
        urlCount: urls.length,
        error: error.message 
      });
      return result;
    }
  }

  /**
   * Update access tracking for a cached entry
   * Called internally when cache is hit
   */
  private async updateAccessTracking(url: string): Promise<void> {
    try {
      const supabase = getSupabaseClient();
      
      // Use the stored procedure for atomic update
      const { error } = await supabase.rpc('update_award_search_cache_access', {
        cache_url: url
      });

      if (error) {
        throw error;
      }
    } catch (error: any) {
      // Don't throw - access tracking is non-critical
      logger.debug('award_search_cache_access_tracking_error', { 
        url, 
        error: error.message 
      });
    }
  }

  /**
   * Clean up expired cache entries
   * Should be called periodically (e.g., daily cron job)
   */
  async cleanupExpired(): Promise<number> {
    try {
      const supabase = getSupabaseClient();
      
      const { data, error } = await supabase.rpc('cleanup_expired_award_search_cache');

      if (error) {
        throw error;
      }

      const deletedCount = data?.[0]?.deleted_count || 0;

      logger.info('award_search_cache_cleanup', { deletedCount });

      return deletedCount;
    } catch (error: any) {
      logger.error('award_search_cache_cleanup_error', { 
        error: error.message 
      });
      return 0;
    }
  }
}

// Export singleton instance with default 7-day TTL
export const awardSearchCacheManager = new AwardSearchCacheManager(7);
