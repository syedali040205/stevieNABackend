/**
 * CrawlerRateLimiter enforces respectful crawling practices by managing
 * request timing, concurrency limits, and exponential backoff for rate-limited responses.
 * 
 * Requirements: 8.1, 8.2, 8.5
 */

export interface RateLimitConfig {
  minDelayMs: number;
  maxConcurrent: number;
  exponentialBackoffBase: number;
}

interface DomainState {
  lastRequestTime: number;
  activeRequests: number;
  backoffMultiplier: number;
}

export class CrawlerRateLimiter {
  private config: Required<RateLimitConfig>;
  private domainStates: Map<string, DomainState>;

  constructor(config: RateLimitConfig) {
    this.config = {
      minDelayMs: config.minDelayMs,
      maxConcurrent: config.maxConcurrent,
      exponentialBackoffBase: config.exponentialBackoffBase,
    };
    this.domainStates = new Map();
  }

  /**
   * Acquires a slot for making a request to the specified domain.
   * Enforces minimum delay between requests and concurrent request limits.
   * 
   * @param domain - The domain to acquire a slot for
   * @returns Promise that resolves when a slot is available
   */
  async acquireSlot(domain: string): Promise<void> {
    const state = this.getOrCreateDomainState(domain);

    // Wait for concurrent request limit
    while (state.activeRequests >= this.config.maxConcurrent) {
      await this.sleep(100); // Check every 100ms
    }

    // Calculate required delay based on last request time and backoff
    const now = Date.now();
    const timeSinceLastRequest = now - state.lastRequestTime;
    const requiredDelay = this.config.minDelayMs * state.backoffMultiplier;

    if (timeSinceLastRequest < requiredDelay) {
      const waitTime = requiredDelay - timeSinceLastRequest;
      await this.sleep(waitTime);
    }

    // Acquire slot
    state.activeRequests++;
    state.lastRequestTime = Date.now();
  }

  /**
   * Releases a slot after a request completes.
   * 
   * @param domain - The domain to release a slot for
   */
  releaseSlot(domain: string): void {
    const state = this.domainStates.get(domain);
    if (state && state.activeRequests > 0) {
      state.activeRequests--;
    }
  }

  /**
   * Handles a 429 (Too Many Requests) response by implementing exponential backoff.
   * 
   * @param domain - The domain that returned the rate limit response
   * @param retryAfter - Optional retry-after value in seconds from the response header
   */
  async handleRateLimitResponse(domain: string, retryAfter?: number): Promise<void> {
    const state = this.getOrCreateDomainState(domain);

    // Increase backoff multiplier exponentially
    state.backoffMultiplier = state.backoffMultiplier * this.config.exponentialBackoffBase;

    // If server provided retry-after, use that; otherwise use exponential backoff
    const waitTime = retryAfter 
      ? retryAfter * 1000 
      : this.config.minDelayMs * state.backoffMultiplier;

    await this.sleep(waitTime);
  }

  /**
   * Gets the current state for a domain, creating it if it doesn't exist.
   * 
   * @param domain - The domain to get state for
   * @returns The domain state
   */
  private getOrCreateDomainState(domain: string): DomainState {
    if (!this.domainStates.has(domain)) {
      this.domainStates.set(domain, {
        lastRequestTime: 0,
        activeRequests: 0,
        backoffMultiplier: 1,
      });
    }
    return this.domainStates.get(domain)!;
  }

  /**
   * Helper method to sleep for a specified duration.
   * 
   * @param ms - Milliseconds to sleep
   * @returns Promise that resolves after the specified time
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Resets the backoff multiplier for a domain (useful after successful requests).
   * 
   * @param domain - The domain to reset backoff for
   */
  resetBackoff(domain: string): void {
    const state = this.domainStates.get(domain);
    if (state) {
      state.backoffMultiplier = 1;
    }
  }

  /**
   * Gets the current number of active requests for a domain.
   * 
   * @param domain - The domain to check
   * @returns Number of active requests
   */
  getActiveRequests(domain: string): number {
    const state = this.domainStates.get(domain);
    return state ? state.activeRequests : 0;
  }

  /**
   * Gets the current backoff multiplier for a domain.
   * 
   * @param domain - The domain to check
   * @returns Current backoff multiplier
   */
  getBackoffMultiplier(domain: string): number {
    const state = this.domainStates.get(domain);
    return state ? state.backoffMultiplier : 1;
  }
}
