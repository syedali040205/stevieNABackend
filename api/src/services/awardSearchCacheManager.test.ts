import { AwardSearchCacheManager, CrawlResult } from './awardSearchCacheManager';
import { getSupabaseClient } from '../config/supabase';

// Mock Supabase client
jest.mock('../config/supabase');
jest.mock('../utils/logger');

describe('AwardSearchCacheManager', () => {
  let cacheManager: AwardSearchCacheManager;
  let mockSupabase: any;

  const mockCrawlResult: CrawlResult = {
    url: 'https://www.stevieawards.com/test',
    title: 'Test Page',
    content: 'Test content',
    headings: ['Heading 1', 'Heading 2'],
    tables: [],
    entities: [],
    metadata: {
      crawledAt: new Date().toISOString(),
      contentType: 'text/html',
      depth: 0,
    },
  };

  beforeEach(() => {
    cacheManager = new AwardSearchCacheManager(7);
    
    // Create mock Supabase client
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      single: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      rpc: jest.fn(),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(mockSupabase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('should return cached data when found and not expired', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day from now

      mockSupabase.single.mockResolvedValue({
        data: {
          url: mockCrawlResult.url,
          data: mockCrawlResult,
          cached_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          access_count: 5,
        },
        error: null,
      });

      mockSupabase.rpc.mockResolvedValue({ error: null });

      const result = await cacheManager.get(mockCrawlResult.url);

      expect(result).not.toBeNull();
      expect(result?.url).toBe(mockCrawlResult.url);
      expect(result?.data).toEqual(mockCrawlResult);
      expect(mockSupabase.from).toHaveBeenCalledWith('award_search_cache');
      expect(mockSupabase.rpc).toHaveBeenCalledWith('update_award_search_cache_access', {
        cache_url: mockCrawlResult.url,
      });
    });

    it('should return null when cache entry not found', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' }, // No rows returned
      });

      const result = await cacheManager.get('https://nonexistent.com');

      expect(result).toBeNull();
    });

    it('should return null when cache entry is expired', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1 day ago

      mockSupabase.single.mockResolvedValue({
        data: {
          url: mockCrawlResult.url,
          data: mockCrawlResult,
          cached_at: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(),
          expires_at: expiresAt.toISOString(),
          access_count: 5,
        },
        error: null,
      });

      const result = await cacheManager.get(mockCrawlResult.url);

      expect(result).toBeNull();
    });

    it('should deduplicate concurrent requests for the same URL', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      mockSupabase.single.mockResolvedValue({
        data: {
          url: mockCrawlResult.url,
          data: mockCrawlResult,
          cached_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          access_count: 5,
        },
        error: null,
      });

      mockSupabase.rpc.mockResolvedValue({ error: null });

      // Make 3 concurrent requests for the same URL
      const [result1, result2, result3] = await Promise.all([
        cacheManager.get(mockCrawlResult.url),
        cacheManager.get(mockCrawlResult.url),
        cacheManager.get(mockCrawlResult.url),
      ]);

      // All should return the same data
      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);

      // But only one database query should have been made
      expect(mockSupabase.single).toHaveBeenCalledTimes(1);
    });

    it('should return null on database error', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      const result = await cacheManager.get(mockCrawlResult.url);

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should store data with default TTL', async () => {
      mockSupabase.upsert.mockResolvedValue({ error: null });

      await cacheManager.set(mockCrawlResult.url, mockCrawlResult);

      expect(mockSupabase.from).toHaveBeenCalledWith('award_search_cache');
      expect(mockSupabase.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          url: mockCrawlResult.url,
          data: mockCrawlResult,
          access_count: 0,
          last_accessed_at: null,
        }),
        { onConflict: 'url' }
      );

      const upsertCall = mockSupabase.upsert.mock.calls[0][0];
      const cachedAt = new Date(upsertCall.cached_at);
      const expiresAt = new Date(upsertCall.expires_at);
      const diffDays = (expiresAt.getTime() - cachedAt.getTime()) / (24 * 60 * 60 * 1000);

      expect(diffDays).toBeCloseTo(7, 0); // 7 days TTL
    });

    it('should store data with custom TTL', async () => {
      mockSupabase.upsert.mockResolvedValue({ error: null });

      await cacheManager.set(mockCrawlResult.url, mockCrawlResult, 14);

      const upsertCall = mockSupabase.upsert.mock.calls[0][0];
      const cachedAt = new Date(upsertCall.cached_at);
      const expiresAt = new Date(upsertCall.expires_at);
      const diffDays = (expiresAt.getTime() - cachedAt.getTime()) / (24 * 60 * 60 * 1000);

      expect(diffDays).toBeCloseTo(14, 0); // 14 days TTL
    });

    it('should throw error on database failure', async () => {
      mockSupabase.upsert.mockResolvedValue({
        error: new Error('Database error'),
      });

      await expect(
        cacheManager.set(mockCrawlResult.url, mockCrawlResult)
      ).rejects.toThrow('Database error');
    });
  });

  describe('invalidate', () => {
    it('should delete cache entry by URL', async () => {
      const mockDelete = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockResolvedValue({ error: null });
      
      mockSupabase.delete = mockDelete;
      mockDelete.mockReturnValue({ eq: mockEq });

      await cacheManager.invalidate(mockCrawlResult.url);

      expect(mockSupabase.from).toHaveBeenCalledWith('award_search_cache');
      expect(mockDelete).toHaveBeenCalled();
      expect(mockEq).toHaveBeenCalledWith('url', mockCrawlResult.url);
    });

    it('should throw error on database failure', async () => {
      const mockDelete = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockResolvedValue({
        error: new Error('Database error'),
      });
      
      mockSupabase.delete = mockDelete;
      mockDelete.mockReturnValue({ eq: mockEq });

      await expect(
        cacheManager.invalidate(mockCrawlResult.url)
      ).rejects.toThrow('Database error');
    });
  });

  describe('isStale', () => {
    it('should return false when cache entry is not expired', async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day from now

      mockSupabase.single.mockResolvedValue({
        data: {
          expires_at: expiresAt.toISOString(),
        },
        error: null,
      });

      const result = await cacheManager.isStale(mockCrawlResult.url);

      expect(result).toBe(false);
    });

    it('should return true when cache entry is expired', async () => {
      const expiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago

      mockSupabase.single.mockResolvedValue({
        data: {
          expires_at: expiresAt.toISOString(),
        },
        error: null,
      });

      const result = await cacheManager.isStale(mockCrawlResult.url);

      expect(result).toBe(true);
    });

    it('should return true when cache entry not found', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' },
      });

      const result = await cacheManager.isStale('https://nonexistent.com');

      expect(result).toBe(true);
    });

    it('should return true on database error', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      const result = await cacheManager.isStale(mockCrawlResult.url);

      expect(result).toBe(true);
    });
  });

  describe('getMultiple', () => {
    it('should return empty map for empty URL array', async () => {
      const result = await cacheManager.getMultiple([]);

      expect(result.size).toBe(0);
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('should return cached data for multiple URLs', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const url1 = 'https://www.stevieawards.com/page1';
      const url2 = 'https://www.stevieawards.com/page2';

      mockSupabase.in.mockResolvedValue({
        data: [
          {
            url: url1,
            data: { ...mockCrawlResult, url: url1 },
            cached_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
            access_count: 3,
          },
          {
            url: url2,
            data: { ...mockCrawlResult, url: url2 },
            cached_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
            access_count: 5,
          },
        ],
        error: null,
      });

      mockSupabase.rpc.mockResolvedValue({ error: null });

      const result = await cacheManager.getMultiple([url1, url2]);

      expect(result.size).toBe(2);
      expect(result.has(url1)).toBe(true);
      expect(result.has(url2)).toBe(true);
      expect(result.get(url1)?.url).toBe(url1);
      expect(result.get(url2)?.url).toBe(url2);
    });

    it('should filter out expired entries', async () => {
      const now = new Date();
      const validExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const expiredExpiresAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const url1 = 'https://www.stevieawards.com/page1';
      const url2 = 'https://www.stevieawards.com/page2';

      mockSupabase.in.mockResolvedValue({
        data: [
          {
            url: url1,
            data: { ...mockCrawlResult, url: url1 },
            cached_at: now.toISOString(),
            expires_at: validExpiresAt.toISOString(),
            access_count: 3,
          },
          {
            url: url2,
            data: { ...mockCrawlResult, url: url2 },
            cached_at: now.toISOString(),
            expires_at: expiredExpiresAt.toISOString(),
            access_count: 5,
          },
        ],
        error: null,
      });

      mockSupabase.rpc.mockResolvedValue({ error: null });

      const result = await cacheManager.getMultiple([url1, url2]);

      expect(result.size).toBe(1);
      expect(result.has(url1)).toBe(true);
      expect(result.has(url2)).toBe(false);
    });

    it('should return empty map on database error', async () => {
      mockSupabase.in.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      const result = await cacheManager.getMultiple(['url1', 'url2']);

      expect(result.size).toBe(0);
    });
  });

  describe('cleanupExpired', () => {
    it('should call cleanup stored procedure and return deleted count', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: [{ deleted_count: 42 }],
        error: null,
      });

      const result = await cacheManager.cleanupExpired();

      expect(result).toBe(42);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('cleanup_expired_award_search_cache');
    });

    it('should return 0 on database error', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      const result = await cacheManager.cleanupExpired();

      expect(result).toBe(0);
    });
  });
});
