import axios, { AxiosInstance } from 'axios';
import logger from '../utils/logger';
import { cacheManager } from './cacheManager';

/**
 * Tavily Crawler Service
 * Production-grade web crawler using Tavily API with best practices:
 * - Breadth-first crawling strategy
 * - Low latency with parallel processing
 * - Rate limiting and circuit breaker
 * - Caching and deduplication
 * - Retry logic with exponential backoff
 * - Comprehensive error handling
 */

interface CrawlOptions {
  url: string;
  maxDepth?: number;
  maxBreadth?: number;
  limit?: number;
  instructions?: string;
  chunksPerSource?: number;
  selectPaths?: string[];
  excludePaths?: string[];
  selectDomains?: string[];
  excludeDomains?: string[];
  extractDepth?: 'basic' | 'advanced';
  includeImages?: boolean;
}

interface CrawlResult {
  url: string;
  title: string;
  content: string;
  rawContent?: string;
  links: string[];
  images?: string[];
  depth: number;
  timestamp: string;
}

interface CrawlResponse {
  results: CrawlResult[];
  failedUrls: string[];
  totalPages: number;
  duration: number;
}

interface QueueItem {
  url: string;
  depth: number;
  priority: number;
}

export class TavilyCrawler {
  private apiKey: string;
  private client: AxiosInstance;
  private requestQueue: QueueItem[] = [];
  private visitedUrls: Set<string> = new Set();
  private failedUrls: Set<string> = new Set();
  private results: CrawlResult[] = [];
  
  // Rate limiting
  private readonly MAX_RPM = 100; // Tavily crawl endpoint limit
  private requestTimestamps: number[] = [];
  
  // Circuit breaker
  private failureCount = 0;
  private readonly FAILURE_THRESHOLD = 5;
  private readonly CIRCUIT_RESET_TIMEOUT = 60000; // 1 minute
  private circuitOpen = false;
  private circuitOpenTime = 0;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.TAVILY_API_KEY || '';
    
    if (!this.apiKey) {
      throw new Error('Tavily API key is required');
    }

    this.client = axios.create({
      baseURL: 'https://api.tavily.com',
      timeout: 60000, // 60 second timeout
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Main crawl method with breadth-first strategy
   */
  async crawl(options: CrawlOptions): Promise<CrawlResponse> {
    const startTime = Date.now();
    
    logger.info('tavily_crawl_started', {
      url: options.url,
      maxDepth: options.maxDepth || 1,
      maxBreadth: options.maxBreadth || 20,
      limit: options.limit || 50,
    });

    // Reset state
    this.requestQueue = [];
    this.visitedUrls = new Set();
    this.failedUrls = new Set();
    this.results = [];

    // Check cache first
    const cacheKey = this.getCacheKey(options);
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      logger.info('tavily_crawl_cache_hit', { url: options.url });
      return cached;
    }

    // Initialize queue with root URL
    this.enqueue({ url: options.url, depth: 0, priority: 0 });

    // Breadth-first crawling
    while (this.requestQueue.length > 0 && this.results.length < (options.limit || 50)) {
      // Check circuit breaker
      if (this.isCircuitOpen()) {
        logger.warn('tavily_circuit_breaker_open', {
          failureCount: this.failureCount,
        });
        break;
      }

      // Process batch of URLs in parallel (respecting rate limits)
      const batchSize = Math.min(5, this.requestQueue.length);
      const batch = this.requestQueue.splice(0, batchSize);

      await Promise.all(
        batch.map(item => this.processUrl(item, options))
      );

      // Small delay to respect rate limits
      await this.delay(100);
    }

    const response: CrawlResponse = {
      results: this.results,
      failedUrls: Array.from(this.failedUrls),
      totalPages: this.results.length,
      duration: Date.now() - startTime,
    };

    // Cache results
    await this.saveToCache(cacheKey, response);

    logger.info('tavily_crawl_completed', {
      url: options.url,
      totalPages: response.totalPages,
      failedUrls: response.failedUrls.length,
      duration: response.duration,
    });

    return response;
  }

  /**
   * Process a single URL with Tavily API
   */
  private async processUrl(item: QueueItem, options: CrawlOptions): Promise<void> {
    const { url, depth } = item;

    // Skip if already visited
    if (this.visitedUrls.has(url)) {
      return;
    }

    // Skip if max depth exceeded
    if (depth > (options.maxDepth || 1)) {
      return;
    }

    // Mark as visited
    this.visitedUrls.add(url);

    // Rate limiting check
    await this.waitForRateLimit();

    try {
      // Call Tavily crawl API
      const result = await this.callTavilyAPI(url, options);

      if (result) {
        this.results.push({
          ...result,
          depth,
          timestamp: new Date().toISOString(),
        });

        // Extract and enqueue new links (breadth-first)
        if (depth < (options.maxDepth || 1)) {
          this.enqueueLinks(result.links, depth + 1, options);
        }

        // Reset failure count on success
        this.failureCount = 0;
      }
    } catch (error: any) {
      logger.error('tavily_crawl_error', {
        url,
        error: error.message,
        depth,
      });

      this.failedUrls.add(url);
      this.failureCount++;

      // Open circuit if too many failures
      if (this.failureCount >= this.FAILURE_THRESHOLD) {
        this.openCircuit();
      }
    }
  }

  /**
   * Call Tavily API with retry logic
   */
  private async callTavilyAPI(
    url: string,
    options: CrawlOptions,
    retries = 3
  ): Promise<CrawlResult | null> {
    const payload = {
      api_key: this.apiKey,
      url,
      max_depth: 1, // Process one level at a time for breadth-first
      max_breadth: options.maxBreadth || 20,
      limit: options.limit || 50,
      instructions: options.instructions,
      chunks_per_source: options.chunksPerSource,
      select_paths: options.selectPaths,
      exclude_paths: options.excludePaths,
      select_domains: options.selectDomains,
      exclude_domains: options.excludeDomains,
      extract_depth: options.extractDepth || 'basic',
      include_images: options.includeImages || false,
    };

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await this.client.post('/crawl', payload);

        // Track request timestamp for rate limiting
        this.requestTimestamps.push(Date.now());

        if (response.data && response.data.results && response.data.results.length > 0) {
          const firstResult = response.data.results[0];
          return {
            url: firstResult.url || url,
            title: firstResult.title || '',
            content: firstResult.content || '',
            rawContent: firstResult.raw_content,
            links: firstResult.links || [],
            images: firstResult.images || [],
            depth: 0, // Will be set by caller
            timestamp: new Date().toISOString(),
          };
        }

        return null;
      } catch (error: any) {
        const isLastAttempt = attempt === retries - 1;

        if (error.response?.status === 429) {
          // Rate limit hit - exponential backoff
          const backoffMs = Math.pow(2, attempt) * 1000;
          logger.warn('tavily_rate_limit_hit', {
            url,
            attempt: attempt + 1,
            backoffMs,
          });
          await this.delay(backoffMs);
        } else if (error.response?.status >= 500) {
          // Server error - retry with backoff
          const backoffMs = Math.pow(2, attempt) * 500;
          logger.warn('tavily_server_error', {
            url,
            status: error.response.status,
            attempt: attempt + 1,
            backoffMs,
          });
          await this.delay(backoffMs);
        } else if (isLastAttempt) {
          // Non-retryable error or last attempt
          throw error;
        }
      }
    }

    return null;
  }

  /**
   * Enqueue links with priority (breadth-first)
   */
  private enqueueLinks(links: string[], depth: number, options: CrawlOptions): void {
    const maxBreadth = options.maxBreadth || 20;
    const linksToAdd = links.slice(0, maxBreadth);

    for (const link of linksToAdd) {
      // Skip if already visited or queued
      if (this.visitedUrls.has(link) || this.isQueued(link)) {
        continue;
      }

      // Apply domain filters
      if (!this.shouldCrawlUrl(link, options)) {
        continue;
      }

      this.enqueue({
        url: link,
        depth,
        priority: depth, // Lower depth = higher priority (breadth-first)
      });
    }
  }

  /**
   * Add URL to queue with priority sorting
   */
  private enqueue(item: QueueItem): void {
    this.requestQueue.push(item);
    
    // Sort by priority (lower number = higher priority)
    this.requestQueue.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Check if URL is already in queue
   */
  private isQueued(url: string): boolean {
    return this.requestQueue.some(item => item.url === url);
  }

  /**
   * Check if URL should be crawled based on filters
   */
  private shouldCrawlUrl(url: string, options: CrawlOptions): boolean {
    try {
      const urlObj = new URL(url);

      // Check domain filters
      if (options.selectDomains && options.selectDomains.length > 0) {
        const matchesDomain = options.selectDomains.some(pattern => {
          const regex = new RegExp(pattern);
          return regex.test(urlObj.hostname);
        });
        if (!matchesDomain) return false;
      }

      if (options.excludeDomains && options.excludeDomains.length > 0) {
        const matchesExclude = options.excludeDomains.some(pattern => {
          const regex = new RegExp(pattern);
          return regex.test(urlObj.hostname);
        });
        if (matchesExclude) return false;
      }

      // Check path filters
      if (options.selectPaths && options.selectPaths.length > 0) {
        const matchesPath = options.selectPaths.some(pattern => {
          const regex = new RegExp(pattern);
          return regex.test(urlObj.pathname);
        });
        if (!matchesPath) return false;
      }

      if (options.excludePaths && options.excludePaths.length > 0) {
        const matchesExclude = options.excludePaths.some(pattern => {
          const regex = new RegExp(pattern);
          return regex.test(urlObj.pathname);
        });
        if (matchesExclude) return false;
      }

      return true;
    } catch (error) {
      // Invalid URL
      return false;
    }
  }

  /**
   * Rate limiting - wait if necessary
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Remove timestamps older than 1 minute
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);

    // Check if we're at the limit
    if (this.requestTimestamps.length >= this.MAX_RPM) {
      const oldestTimestamp = this.requestTimestamps[0];
      const waitTime = 60000 - (now - oldestTimestamp) + 100; // Add 100ms buffer

      if (waitTime > 0) {
        logger.info('tavily_rate_limit_wait', { waitTimeMs: waitTime });
        await this.delay(waitTime);
      }
    }
  }

  /**
   * Circuit breaker - check if circuit is open
   */
  private isCircuitOpen(): boolean {
    if (!this.circuitOpen) {
      return false;
    }

    // Check if circuit should be reset
    const now = Date.now();
    if (now - this.circuitOpenTime > this.CIRCUIT_RESET_TIMEOUT) {
      this.closeCircuit();
      return false;
    }

    return true;
  }

  /**
   * Open circuit breaker
   */
  private openCircuit(): void {
    this.circuitOpen = true;
    this.circuitOpenTime = Date.now();
    logger.warn('tavily_circuit_breaker_opened', {
      failureCount: this.failureCount,
    });
  }

  /**
   * Close circuit breaker
   */
  private closeCircuit(): void {
    this.circuitOpen = false;
    this.failureCount = 0;
    logger.info('tavily_circuit_breaker_closed');
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate cache key
   */
  private getCacheKey(options: CrawlOptions): string {
    const key = `tavily:crawl:${options.url}:${options.maxDepth || 1}:${options.maxBreadth || 20}:${options.limit || 50}`;
    return key;
  }

  /**
   * Get from cache
   */
  private async getFromCache(key: string): Promise<CrawlResponse | null> {
    try {
      const cached = await cacheManager.get<CrawlResponse>(key);
      return cached;
    } catch (error) {
      return null;
    }
  }

  /**
   * Save to cache
   */
  private async saveToCache(key: string, data: CrawlResponse): Promise<void> {
    try {
      // Cache for 1 hour
      await cacheManager.set(key, data, 3600);
    } catch (error) {
      logger.warn('tavily_cache_save_failed', { error });
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', {
        timeout: 5000,
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
export const tavilyCrawler = new TavilyCrawler();
