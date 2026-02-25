import * as fc from 'fast-check';
import { AwardSearchCacheManager, CrawlResult } from './awardSearchCacheManager';
import { getSupabaseClient } from '../config/supabase';

/**
 * Property-Based Tests for Award Search Cache Manager
 * Feature: award-search-assistant
 * 
 * These tests verify universal properties across randomized inputs
 * to ensure correctness under all conditions.
 */

// Mock Supabase client
jest.mock('../config/supabase');
jest.mock('../utils/logger');

describe('AwardSearchCacheManager - Property-Based Tests', () => {
  let cacheManager: AwardSearchCacheManager;
  let mockSupabase: any;

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

  /**
   * Property 20: Cache Storage with URL Key
   * **Validates: Requirements 7.1**
   * 
   * For any crawled content, storing it in the cache should use 
   * the normalized URL as the primary key.
   */
  describe('Property 20: Cache Storage with URL Key', () => {
    it('should use URL as primary key when storing any crawled content', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary URLs
          fc.webUrl(),
          // Generate arbitrary crawl result data
          fc.record({
            title: fc.string({ minLength: 1, maxLength: 200 }),
            content: fc.string({ minLength: 0, maxLength: 1000 }),
            headings: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 10 }),
            depth: fc.integer({ min: 0, max: 5 }),
          }),
          async (url, resultData) => {
            // Setup mock to succeed
            mockSupabase.upsert.mockResolvedValue({ error: null });

            // Create crawl result with the generated URL
            const crawlResult: CrawlResult = {
              url,
              title: resultData.title,
              content: resultData.content,
              headings: resultData.headings,
              tables: [],
              entities: [],
              metadata: {
                crawledAt: new Date().toISOString(),
                contentType: 'text/html',
                depth: resultData.depth,
              },
            };

            // Store in cache
            await cacheManager.set(url, crawlResult);

            // Verify that upsert was called with the URL as the key
            expect(mockSupabase.from).toHaveBeenCalledWith('award_search_cache');
            expect(mockSupabase.upsert).toHaveBeenCalledWith(
              expect.objectContaining({
                url: url, // URL must be used as the primary key
                data: crawlResult,
              }),
              { onConflict: 'url' } // URL is the conflict resolution key
            );

            // Reset mocks for next iteration
            jest.clearAllMocks();
            mockSupabase = {
              from: jest.fn().mockReturnThis(),
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              in: jest.fn().mockReturnThis(),
              single: jest.fn(),
              upsert: jest.fn().mockResolvedValue({ error: null }),
              delete: jest.fn(),
              rpc: jest.fn(),
            };
            (getSupabaseClient as jest.Mock).mockReturnValue(mockSupabase);
          }
        ),
        { numRuns: 100 } // Run 100 iterations with different random inputs
      );
    });

    it('should retrieve cached content using URL as the lookup key', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.webUrl(),
          fc.record({
            title: fc.string({ minLength: 1, maxLength: 200 }),
            content: fc.string({ minLength: 0, maxLength: 1000 }),
            headings: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 10 }),
          }),
          async (url, resultData) => {
            const now = new Date();
            const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

            const crawlResult: CrawlResult = {
              url,
              title: resultData.title,
              content: resultData.content,
              headings: resultData.headings,
              tables: [],
              entities: [],
              metadata: {
                crawledAt: now.toISOString(),
                contentType: 'text/html',
                depth: 0,
              },
            };

            // Setup mock to return data
            mockSupabase.single.mockResolvedValue({
              data: {
                url,
                data: crawlResult,
                cached_at: now.toISOString(),
                expires_at: expiresAt.toISOString(),
                access_count: 0,
              },
              error: null,
            });

            mockSupabase.rpc.mockResolvedValue({ error: null });

            // Retrieve from cache
            const result = await cacheManager.get(url);

            // Verify that the query used URL as the lookup key
            expect(mockSupabase.from).toHaveBeenCalledWith('award_search_cache');
            expect(mockSupabase.eq).toHaveBeenCalledWith('url', url);
            
            // Verify the result matches the URL
            expect(result).not.toBeNull();
            expect(result?.url).toBe(url);

            // Reset mocks for next iteration
            jest.clearAllMocks();
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
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should invalidate cached content using URL as the deletion key', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.webUrl(),
          async (url) => {
            const mockDelete = jest.fn().mockReturnThis();
            const mockEq = jest.fn().mockResolvedValue({ error: null });
            
            mockSupabase.delete = mockDelete;
            mockDelete.mockReturnValue({ eq: mockEq });

            // Invalidate cache entry
            await cacheManager.invalidate(url);

            // Verify that delete used URL as the key
            expect(mockSupabase.from).toHaveBeenCalledWith('award_search_cache');
            expect(mockDelete).toHaveBeenCalled();
            expect(mockEq).toHaveBeenCalledWith('url', url);

            // Reset mocks for next iteration
            jest.clearAllMocks();
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
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should check staleness using URL as the lookup key', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.webUrl(),
          fc.boolean(), // Whether the entry is stale or not
          async (url, shouldBeStale) => {
            const now = new Date();
            const expiresAt = shouldBeStale
              ? new Date(now.getTime() - 24 * 60 * 60 * 1000) // Expired
              : new Date(now.getTime() + 24 * 60 * 60 * 1000); // Valid

            mockSupabase.single.mockResolvedValue({
              data: {
                expires_at: expiresAt.toISOString(),
              },
              error: null,
            });

            // Check staleness
            const isStale = await cacheManager.isStale(url);

            // Verify that the query used URL as the lookup key
            expect(mockSupabase.from).toHaveBeenCalledWith('award_search_cache');
            expect(mockSupabase.eq).toHaveBeenCalledWith('url', url);
            
            // Verify staleness matches expectation
            expect(isStale).toBe(shouldBeStale);

            // Reset mocks for next iteration
            jest.clearAllMocks();
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
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should retrieve multiple entries using URLs as lookup keys', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.webUrl(), { minLength: 1, maxLength: 10 }),
          async (urls) => {
            const now = new Date();
            const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

            // Create mock data for each URL
            const mockData = urls.map(url => ({
              url,
              data: {
                url,
                title: 'Test',
                content: 'Content',
                headings: [],
                tables: [],
                entities: [],
                metadata: {
                  crawledAt: now.toISOString(),
                  contentType: 'text/html',
                  depth: 0,
                },
              },
              cached_at: now.toISOString(),
              expires_at: expiresAt.toISOString(),
              access_count: 0,
            }));

            mockSupabase.in.mockResolvedValue({
              data: mockData,
              error: null,
            });

            mockSupabase.rpc.mockResolvedValue({ error: null });

            // Retrieve multiple entries
            const result = await cacheManager.getMultiple(urls);

            // Verify that the query used URLs as lookup keys
            expect(mockSupabase.from).toHaveBeenCalledWith('award_search_cache');
            expect(mockSupabase.in).toHaveBeenCalledWith('url', urls);
            
            // Verify all URLs are in the result
            urls.forEach(url => {
              expect(result.has(url)).toBe(true);
              expect(result.get(url)?.url).toBe(url);
            });

            // Reset mocks for next iteration
            jest.clearAllMocks();
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
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 22: Cache Timestamp Storage
   * **Validates: Requirements 7.3**
   * 
   * For any cached entry, it should include both cachedAt and expiresAt timestamps.
   */
  describe('Property 22: Cache Timestamp Storage', () => {
    it('should store both cachedAt and expiresAt timestamps when caching any content', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.webUrl(),
          fc.record({
            title: fc.string({ minLength: 1, maxLength: 200 }),
            content: fc.string({ minLength: 0, maxLength: 1000 }),
            headings: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 10 }),
          }),
          fc.integer({ min: 1, max: 30 }), // TTL in days
          async (url, resultData, ttlDays) => {
            // Setup mock to succeed
            mockSupabase.upsert.mockResolvedValue({ error: null });

            const crawlResult: CrawlResult = {
              url,
              title: resultData.title,
              content: resultData.content,
              headings: resultData.headings,
              tables: [],
              entities: [],
              metadata: {
                crawledAt: new Date().toISOString(),
                contentType: 'text/html',
                depth: 0,
              },
            };

            // Store in cache with custom TTL
            await cacheManager.set(url, crawlResult, ttlDays);

            // Verify that upsert was called with both timestamps
            expect(mockSupabase.upsert).toHaveBeenCalledWith(
              expect.objectContaining({
                url,
                data: crawlResult,
                cached_at: expect.any(String), // Must have cachedAt timestamp
                expires_at: expect.any(String), // Must have expiresAt timestamp
              }),
              { onConflict: 'url' }
            );

            // Extract the actual call arguments
            const callArgs = mockSupabase.upsert.mock.calls[0][0];
            const cachedAt = new Date(callArgs.cached_at);
            const expiresAt = new Date(callArgs.expires_at);

            // Verify timestamps are valid dates
            expect(cachedAt.getTime()).not.toBeNaN();
            expect(expiresAt.getTime()).not.toBeNaN();

            // Verify expiresAt is after cachedAt
            expect(expiresAt.getTime()).toBeGreaterThan(cachedAt.getTime());

            // Verify the TTL is approximately correct (within 1 second tolerance)
            const expectedTTLMs = ttlDays * 24 * 60 * 60 * 1000;
            const actualTTLMs = expiresAt.getTime() - cachedAt.getTime();
            expect(Math.abs(actualTTLMs - expectedTTLMs)).toBeLessThan(1000);

            // Reset mocks for next iteration
            jest.clearAllMocks();
            mockSupabase = {
              from: jest.fn().mockReturnThis(),
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              in: jest.fn().mockReturnThis(),
              single: jest.fn(),
              upsert: jest.fn().mockResolvedValue({ error: null }),
              delete: jest.fn(),
              rpc: jest.fn(),
            };
            (getSupabaseClient as jest.Mock).mockReturnValue(mockSupabase);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return both cachedAt and expiresAt timestamps when retrieving cached content', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.webUrl(),
          fc.record({
            title: fc.string({ minLength: 1, maxLength: 200 }),
            content: fc.string({ minLength: 0, maxLength: 1000 }),
          }),
          fc.integer({ min: 1, max: 30 }), // TTL in days
          async (url, resultData, ttlDays) => {
            // Use current time to ensure cache is not expired
            const cachedAt = new Date();
            const expiresAt = new Date(cachedAt.getTime() + ttlDays * 24 * 60 * 60 * 1000);

            const crawlResult: CrawlResult = {
              url,
              title: resultData.title,
              content: resultData.content,
              headings: [],
              tables: [],
              entities: [],
              metadata: {
                crawledAt: cachedAt.toISOString(),
                contentType: 'text/html',
                depth: 0,
              },
            };

            // Setup mock to return data with timestamps
            mockSupabase.single.mockResolvedValue({
              data: {
                url,
                data: crawlResult,
                cached_at: cachedAt.toISOString(),
                expires_at: expiresAt.toISOString(),
                access_count: 0,
              },
              error: null,
            });

            mockSupabase.rpc.mockResolvedValue({ error: null });

            // Retrieve from cache
            const result = await cacheManager.get(url);

            // Verify result is not null
            expect(result).not.toBeNull();

            // Verify both timestamps are present
            expect(result?.cachedAt).toBeInstanceOf(Date);
            expect(result?.expiresAt).toBeInstanceOf(Date);

            // Verify timestamps match the stored values (within 1ms tolerance for rounding)
            expect(Math.abs(result!.cachedAt.getTime() - cachedAt.getTime())).toBeLessThan(1);
            expect(Math.abs(result!.expiresAt.getTime() - expiresAt.getTime())).toBeLessThan(1);

            // Verify expiresAt is after cachedAt
            expect(result!.expiresAt.getTime()).toBeGreaterThan(result!.cachedAt.getTime());

            // Reset mocks for next iteration
            jest.clearAllMocks();
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
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include timestamps for all entries when retrieving multiple cached items', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.webUrl(), { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 1, max: 30 }),
          async (urls, ttlDays) => {
            // Use current time to ensure cache is not expired
            const baseDate = new Date();
            const expiresAt = new Date(baseDate.getTime() + ttlDays * 24 * 60 * 60 * 1000);

            // Create mock data for each URL with timestamps
            const mockData = urls.map(url => ({
              url,
              data: {
                url,
                title: 'Test',
                content: 'Content',
                headings: [],
                tables: [],
                entities: [],
                metadata: {
                  crawledAt: baseDate.toISOString(),
                  contentType: 'text/html',
                  depth: 0,
                },
              },
              cached_at: baseDate.toISOString(),
              expires_at: expiresAt.toISOString(),
              access_count: 0,
            }));

            mockSupabase.in.mockResolvedValue({
              data: mockData,
              error: null,
            });

            mockSupabase.rpc.mockResolvedValue({ error: null });

            // Retrieve multiple entries
            const result = await cacheManager.getMultiple(urls);

            // Verify all entries have both timestamps
            urls.forEach(url => {
              const entry = result.get(url);
              expect(entry).toBeDefined();
              expect(entry?.cachedAt).toBeInstanceOf(Date);
              expect(entry?.expiresAt).toBeInstanceOf(Date);
              
              // Verify timestamps are correct (within 1ms tolerance)
              expect(Math.abs(entry!.cachedAt.getTime() - baseDate.getTime())).toBeLessThan(1);
              expect(Math.abs(entry!.expiresAt.getTime() - expiresAt.getTime())).toBeLessThan(1);
              
              // Verify expiresAt is after cachedAt
              expect(entry!.expiresAt.getTime()).toBeGreaterThan(entry!.cachedAt.getTime());
            });

            // Reset mocks for next iteration
            jest.clearAllMocks();
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
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should use default TTL when no TTL is specified', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.webUrl(),
          fc.record({
            title: fc.string({ minLength: 1, maxLength: 200 }),
            content: fc.string({ minLength: 0, maxLength: 1000 }),
          }),
          async (url, resultData) => {
            // Setup mock to succeed
            mockSupabase.upsert.mockResolvedValue({ error: null });

            const crawlResult: CrawlResult = {
              url,
              title: resultData.title,
              content: resultData.content,
              headings: [],
              tables: [],
              entities: [],
              metadata: {
                crawledAt: new Date().toISOString(),
                contentType: 'text/html',
                depth: 0,
              },
            };

            // Store in cache without specifying TTL (should use default 7 days)
            await cacheManager.set(url, crawlResult);

            // Verify that upsert was called with timestamps
            expect(mockSupabase.upsert).toHaveBeenCalled();
            const callArgs = mockSupabase.upsert.mock.calls[0][0];
            
            const cachedAt = new Date(callArgs.cached_at);
            const expiresAt = new Date(callArgs.expires_at);

            // Verify default TTL of 7 days (within 1 second tolerance)
            const expectedTTLMs = 7 * 24 * 60 * 60 * 1000;
            const actualTTLMs = expiresAt.getTime() - cachedAt.getTime();
            expect(Math.abs(actualTTLMs - expectedTTLMs)).toBeLessThan(1000);

            // Reset mocks for next iteration
            jest.clearAllMocks();
            mockSupabase = {
              from: jest.fn().mockReturnThis(),
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              in: jest.fn().mockReturnThis(),
              single: jest.fn(),
              upsert: jest.fn().mockResolvedValue({ error: null }),
              delete: jest.fn(),
              rpc: jest.fn(),
            };
            (getSupabaseClient as jest.Mock).mockReturnValue(mockSupabase);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 23: Stale Data Detection
   * **Validates: Requirements 7.4**
   * 
   * For any cached entry where (current time - cachedAt) > 7 days, 
   * the Cache Manager should mark it as stale.
   */
  describe('Property 23: Stale Data Detection', () => {
    it('should mark entries as stale when cached more than 7 days ago', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.webUrl(),
          fc.integer({ min: 8, max: 365 }), // Days in the past (more than 7)
          async (url, daysOld) => {
            const now = new Date();
            const cachedAt = new Date(now.getTime() - daysOld * 24 * 60 * 60 * 1000);
            const expiresAt = new Date(cachedAt.getTime() + 7 * 24 * 60 * 60 * 1000);

            // Setup mock to return old cached data
            mockSupabase.single.mockResolvedValue({
              data: {
                url,
                expires_at: expiresAt.toISOString(),
              },
              error: null,
            });

            // Check if stale
            const isStale = await cacheManager.isStale(url);

            // Verify it's marked as stale (expires_at is in the past)
            expect(isStale).toBe(true);

            // Verify the query used URL as lookup key
            expect(mockSupabase.from).toHaveBeenCalledWith('award_search_cache');
            expect(mockSupabase.eq).toHaveBeenCalledWith('url', url);

            // Reset mocks for next iteration
            jest.clearAllMocks();
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
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should NOT mark entries as stale when cached less than 7 days ago', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.webUrl(),
          fc.integer({ min: 0, max: 6 }), // Days in the past (less than 7)
          fc.integer({ min: 0, max: 23 }), // Hours
          fc.integer({ min: 0, max: 59 }), // Minutes
          async (url, daysOld, hoursOld, minutesOld) => {
            const now = new Date();
            const ageMs = (daysOld * 24 * 60 * 60 * 1000) + 
                         (hoursOld * 60 * 60 * 1000) + 
                         (minutesOld * 60 * 1000);
            const cachedAt = new Date(now.getTime() - ageMs);
            const expiresAt = new Date(cachedAt.getTime() + 7 * 24 * 60 * 60 * 1000);

            // Setup mock to return recent cached data
            mockSupabase.single.mockResolvedValue({
              data: {
                url,
                expires_at: expiresAt.toISOString(),
              },
              error: null,
            });

            // Check if stale
            const isStale = await cacheManager.isStale(url);

            // Verify it's NOT marked as stale (expires_at is in the future)
            expect(isStale).toBe(false);

            // Verify the query used URL as lookup key
            expect(mockSupabase.from).toHaveBeenCalledWith('award_search_cache');
            expect(mockSupabase.eq).toHaveBeenCalledWith('url', url);

            // Reset mocks for next iteration
            jest.clearAllMocks();
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
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should mark entries as stale at exactly 7 days boundary', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.webUrl(),
          fc.integer({ min: 1, max: 1000 }), // Extra milliseconds past 7 days (min 1 to ensure it's in the past)
          async (url, extraMs) => {
            const now = new Date();
            const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
            const cachedAt = new Date(now.getTime() - sevenDaysMs - extraMs);
            const expiresAt = new Date(cachedAt.getTime() + sevenDaysMs);

            // Setup mock to return data at 7-day boundary
            mockSupabase.single.mockResolvedValue({
              data: {
                url,
                expires_at: expiresAt.toISOString(),
              },
              error: null,
            });

            // Check if stale
            const isStale = await cacheManager.isStale(url);

            // Verify it's marked as stale (expires_at is in the past)
            expect(isStale).toBe(true);

            // Reset mocks for next iteration
            jest.clearAllMocks();
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
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should treat non-existent entries as stale', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.webUrl(),
          async (url) => {
            // Setup mock to return no data (cache miss)
            mockSupabase.single.mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' }, // PostgreSQL "no rows" error
            });

            // Check if stale
            const isStale = await cacheManager.isStale(url);

            // Verify non-existent entries are treated as stale
            expect(isStale).toBe(true);

            // Verify the query attempted to look up the URL
            expect(mockSupabase.from).toHaveBeenCalledWith('award_search_cache');
            expect(mockSupabase.eq).toHaveBeenCalledWith('url', url);

            // Reset mocks for next iteration
            jest.clearAllMocks();
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
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle custom TTL values correctly for staleness detection', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.webUrl(),
          fc.integer({ min: 1, max: 30 }), // Custom TTL in days
          fc.integer({ min: 0, max: 60 }), // Days old
          async (url, customTTL, daysOld) => {
            const now = new Date();
            const cachedAt = new Date(now.getTime() - daysOld * 24 * 60 * 60 * 1000);
            const expiresAt = new Date(cachedAt.getTime() + customTTL * 24 * 60 * 60 * 1000);

            // Setup mock to return data with custom TTL
            mockSupabase.single.mockResolvedValue({
              data: {
                url,
                expires_at: expiresAt.toISOString(),
              },
              error: null,
            });

            // Check if stale
            const isStale = await cacheManager.isStale(url);

            // Verify staleness is based on expires_at, not hardcoded 7 days
            const expectedStale = expiresAt < now;
            expect(isStale).toBe(expectedStale);

            // Reset mocks for next iteration
            jest.clearAllMocks();
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
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should treat database errors as stale for safety', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.webUrl(),
          fc.constantFrom(
            'CONNECTION_ERROR',
            'TIMEOUT',
            'PERMISSION_DENIED',
            'UNKNOWN_ERROR'
          ),
          async (url, errorCode) => {
            // Setup mock to return a database error
            mockSupabase.single.mockResolvedValue({
              data: null,
              error: { code: errorCode, message: 'Database error' },
            });

            // Check if stale
            const isStale = await cacheManager.isStale(url);

            // Verify errors are treated as stale (fail-safe behavior)
            expect(isStale).toBe(true);

            // Reset mocks for next iteration
            jest.clearAllMocks();
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
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
