import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { getAwardSearchConfig, resetAwardSearchConfig } from './awardSearch';

describe('Award Search Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset cached config before each test
    resetAwardSearchConfig();
    // Create a fresh copy of process.env
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    resetAwardSearchConfig();
  });

  it('should use default values when environment variables are not set', () => {
    const config = getAwardSearchConfig();

    expect(config.AWARD_SEARCH_CACHE_TTL_DAYS).toBe(7);
    expect(config.AWARD_SEARCH_MAX_QUEUE_DEPTH).toBe(50);
    expect(config.AWARD_SEARCH_CRAWLER_CONCURRENCY).toBe(3);
    expect(config.AWARD_SEARCH_CRAWLER_DELAY_MS).toBe(1000);
    expect(config.AWARD_SEARCH_CRAWLER_MAX_DEPTH).toBe(2);
    expect(config.AWARD_SEARCH_CRAWLER_MAX_RETRIES).toBe(3);
    expect(config.AWARD_SEARCH_CRAWLER_BACKOFF_BASE).toBe(2);
  });

  it('should parse environment variables correctly', () => {
    process.env.AWARD_SEARCH_CACHE_TTL_DAYS = '14';
    process.env.AWARD_SEARCH_MAX_QUEUE_DEPTH = '100';
    process.env.AWARD_SEARCH_CRAWLER_CONCURRENCY = '5';
    process.env.AWARD_SEARCH_CRAWLER_DELAY_MS = '2000';
    process.env.AWARD_SEARCH_CRAWLER_MAX_DEPTH = '3';
    process.env.AWARD_SEARCH_CRAWLER_MAX_RETRIES = '5';
    process.env.AWARD_SEARCH_CRAWLER_BACKOFF_BASE = '3';

    const config = getAwardSearchConfig();

    expect(config.AWARD_SEARCH_CACHE_TTL_DAYS).toBe(14);
    expect(config.AWARD_SEARCH_MAX_QUEUE_DEPTH).toBe(100);
    expect(config.AWARD_SEARCH_CRAWLER_CONCURRENCY).toBe(5);
    expect(config.AWARD_SEARCH_CRAWLER_DELAY_MS).toBe(2000);
    expect(config.AWARD_SEARCH_CRAWLER_MAX_DEPTH).toBe(3);
    expect(config.AWARD_SEARCH_CRAWLER_MAX_RETRIES).toBe(5);
    expect(config.AWARD_SEARCH_CRAWLER_BACKOFF_BASE).toBe(3);
  });

  it('should cache configuration after first call', () => {
    process.env.AWARD_SEARCH_CACHE_TTL_DAYS = '10';
    
    const config1 = getAwardSearchConfig();
    expect(config1.AWARD_SEARCH_CACHE_TTL_DAYS).toBe(10);

    // Change environment variable
    process.env.AWARD_SEARCH_CACHE_TTL_DAYS = '20';
    
    // Should still return cached value
    const config2 = getAwardSearchConfig();
    expect(config2.AWARD_SEARCH_CACHE_TTL_DAYS).toBe(10);
  });

  it('should validate positive integers for cache TTL', () => {
    process.env.AWARD_SEARCH_CACHE_TTL_DAYS = '-1';
    
    expect(() => getAwardSearchConfig()).toThrow('Award Search configuration validation failed');
  });

  it('should validate crawler concurrency max limit', () => {
    process.env.AWARD_SEARCH_CRAWLER_CONCURRENCY = '20';
    
    expect(() => getAwardSearchConfig()).toThrow('Award Search configuration validation failed');
  });

  it('should validate minimum crawler delay', () => {
    process.env.AWARD_SEARCH_CRAWLER_DELAY_MS = '100';
    
    expect(() => getAwardSearchConfig()).toThrow('Award Search configuration validation failed');
  });

  it('should validate crawler depth range', () => {
    process.env.AWARD_SEARCH_CRAWLER_MAX_DEPTH = '10';
    
    expect(() => getAwardSearchConfig()).toThrow('Award Search configuration validation failed');
  });

  it('should validate positive backoff base', () => {
    process.env.AWARD_SEARCH_CRAWLER_BACKOFF_BASE = '-1';
    
    expect(() => getAwardSearchConfig()).toThrow('Award Search configuration validation failed');
  });
});
