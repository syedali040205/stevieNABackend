import { CrawlResult } from './crawler.js';

export interface CachedData {
  url: string;
  data: CrawlResult;
  cachedAt: string;
  expiresAt: string;
}

export class CacheManager {
  private cache: Map<string, CachedData>;
  private cacheExpiryDays: number;

  constructor(cacheExpiryDays: number = 7) {
    this.cache = new Map();
    this.cacheExpiryDays = cacheExpiryDays;
  }

  async get(url: string): Promise<CrawlResult | null> {
    const cached = this.cache.get(url);
    
    if (!cached) {
      return null;
    }

    // Check if expired
    if (new Date(cached.expiresAt) < new Date()) {
      this.cache.delete(url);
      return null;
    }

    return cached.data;
  }

  async set(url: string, data: CrawlResult): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.cacheExpiryDays * 24 * 60 * 60 * 1000);

    this.cache.set(url, {
      url,
      data,
      cachedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
  }

  async has(url: string): Promise<boolean> {
    const data = await this.get(url);
    return data !== null;
  }

  async invalidate(url: string): Promise<void> {
    this.cache.delete(url);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  getStats() {
    return {
      size: this.cache.size,
      expiryDays: this.cacheExpiryDays,
    };
  }
}
