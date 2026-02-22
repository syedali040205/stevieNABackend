# OpenAI Request Queue Best Practices

## Document Overview

This document consolidates industry best practices for OpenAI API request queuing, rate limiting, and scalability patterns. It combines insights from production systems, research articles, and analysis of the current Stevie Awards chatbot implementation.

**Last Updated:** February 2026  
**Status:** Reference Document  
**Related Specs:** Phase 1 Scalability Optimizations

---

## Table of Contents

1. [Current Implementation Analysis](#current-implementation-analysis)
2. [Industry Best Practices](#industry-best-practices)
3. [Queue Management Patterns](#queue-management-patterns)
4. [Rate Limiting Strategies](#rate-limiting-strategies)
5. [Error Handling & Recovery](#error-handling--recovery)
6. [Caching Strategies](#caching-strategies)
7. [Monitoring & Observability](#monitoring--observability)
8. [Production Deployment Checklist](#production-deployment-checklist)
9. [Recommendations for Phase 2](#recommendations-for-phase-2)

---

## Current Implementation Analysis

### What We Have ✅

**Queue Infrastructure (Tasks 1-3 Complete)**
- ✅ p-queue library with priority-based scheduling
- ✅ Concurrency limit: 10 concurrent requests
- ✅ Rate limit: 50 requests/second
- ✅ Priority levels: INTAKE (1), QA/RECOMMENDATION (2), EXPLANATION (3)
- ✅ Environment variable configuration
- ✅ Integrated into all OpenAI service methods

**Existing Resilience Patterns**
- ✅ Circuit breaker pattern (prevents cascade failures)
- ✅ Exponential backoff retry (3 attempts, 1s → 2s → 4s delays)
- ✅ Request timeouts (30 seconds)
- ✅ Abort signal support for cancellation
- ✅ Graceful degradation (Redis cache failures)

**Caching Layer**
- ✅ Embedding cache (7 day TTL)
- ✅ Session cache (1 hour TTL)
- ✅ Rate limit tracking (60 second windows)
- ✅ Graceful degradation when Redis unavailable

### What We're Missing ⚠️

**Advanced Queue Features**
- ⚠️ Queue depth monitoring/alerting
- ⚠️ Request timeout in queue (requests can wait indefinitely)
- ⚠️ Queue overflow handling (what happens at 1000+ queued requests?)
- ⚠️ Per-user queue limits (prevent single user from filling queue)
- ⚠️ Queue metrics export (Prometheus/CloudWatch)

**Enhanced Error Handling**
- ⚠️ Retry-After header respect (OpenAI provides this in 429 responses)
- ⚠️ Jitter in retry delays (prevents thundering herd)
- ⚠️ Dead letter queue for permanently failed requests
- ⚠️ Request correlation IDs for distributed tracing

**Cost Optimization**
- ⚠️ Token usage tracking per user/feature
- ⚠️ Cost attribution and budgeting
- ⚠️ Automatic model fallback (GPT-4 → GPT-4-mini on rate limits)
- ⚠️ Batch API usage for non-urgent requests (50% cost savings)

**Observability**
- ⚠️ Queue wait time metrics
- ⚠️ Request latency percentiles (p50, p95, p99)
- ⚠️ Error rate by type (rate limit vs timeout vs server error)
- ⚠️ Cost per request tracking

---

## Industry Best Practices

### 1. Queue Configuration

**Concurrency Limits** (Source: OpenAI Community, Production Systems)

```typescript
// Current: Fixed 10 concurrent
// Best Practice: Dynamic based on tier and load

const CONCURRENCY_BY_TIER = {
  free: 3,
  tier1: 5,
  tier2: 10,
  tier3: 20,
  tier4: 50,
  tier5: 100
};

// Adjust based on current error rate
function getOptimalConcurrency(tier: string, errorRate: number): number {
  const base = CONCURRENCY_BY_TIER[tier] || 10;
  if (errorRate > 0.05) return Math.max(1, Math.floor(base * 0.5)); // Reduce by 50%
  if (errorRate > 0.01) return Math.max(1, Math.floor(base * 0.75)); // Reduce by 25%
  return base;
}
```

**Rate Limiting** (Source: Zen van Riel, OpenAI Best Practices)

```typescript
// Current: Fixed 50 req/sec
// Best Practice: Respect OpenAI tier limits

const RATE_LIMITS_BY_TIER = {
  free: { rpm: 3, tpm: 40000 },
  tier1: { rpm: 500, tpm: 200000 },
  tier2: { rpm: 5000, tpm: 2000000 },
  tier3: { rpm: 10000, tpm: 10000000 },
  tier4: { rpm: 30000, tpm: 30000000 },
  tier5: { rpm: 100000, tpm: 150000000 }
};

// Track both requests AND tokens per minute
class AdaptiveRateLimiter {
  private requestsThisMinute = 0;
  private tokensThisMinute = 0;
  
  canMakeRequest(estimatedTokens: number): boolean {
    const limits = RATE_LIMITS_BY_TIER[this.tier];
    return this.requestsThisMinute < limits.rpm && 
           this.tokensThisMinute + estimatedTokens < limits.tpm;
  }
}
```

### 2. Priority Queue Patterns

**Priority Assignment** (Source: OneUpTime, High-Load Node.js Services)

```typescript
// Current: 3 priority levels
// Best Practice: More granular priorities with context

enum RequestPriority {
  CRITICAL = 0,      // User-facing, real-time (intake questions)
  HIGH = 1,          // Important but can wait (recommendations)
  NORMAL = 2,        // Standard operations (Q&A)
  LOW = 3,           // Background tasks (explanations)
  BATCH = 4          // Non-urgent, can use Batch API
}

// Dynamic priority based on context
function calculatePriority(context: RequestContext): RequestPriority {
  if (context.isUserWaiting && context.sessionAge < 60) return RequestPriority.CRITICAL;
  if (context.retryCount > 0) return RequestPriority.HIGH; // Prioritize retries
  if (context.isBatchable) return RequestPriority.BATCH;
  return RequestPriority.NORMAL;
}
```

**Queue Overflow Protection** (Source: Wild.codes, Chatbot Architecture)

```typescript
// Best Practice: Limit queue size and implement backpressure

class ProtectedQueue extends PQueue {
  private readonly MAX_QUEUE_SIZE = 1000;
  private readonly MAX_WAIT_TIME_MS = 60000; // 1 minute
  
  async enqueue<T>(fn: () => Promise<T>, priority: number): Promise<T> {
    // Reject if queue too large
    if (this.size > this.MAX_QUEUE_SIZE) {
      throw new Error('Queue overflow - system at capacity');
    }
    
    // Add timeout for queued requests
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout in queue')), this.MAX_WAIT_TIME_MS);
    });
    
    return Promise.race([
      super.add(fn, { priority }),
      timeoutPromise
    ]);
  }
}
```

### 3. Retry Strategies

**Exponential Backoff with Jitter** (Source: Zen van Riel, AWS Best Practices)

```typescript
// Current: Simple exponential backoff
// Best Practice: Add jitter to prevent thundering herd

async function retryWithBackoffAndJitter<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      if (!isRetryableError(error) || attempt === maxAttempts) {
        throw error;
      }
      
      // Respect Retry-After header if present
      const retryAfter = error.response?.headers?.['retry-after'];
      if (retryAfter) {
        const delayMs = parseInt(retryAfter) * 1000;
        await sleep(delayMs);
        continue;
      }
      
      // Exponential backoff with jitter
      const baseDelay = 1000 * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 1000; // 0-1000ms random jitter
      const delay = baseDelay + jitter;
      
      logger.warn('retry_with_jitter', { 
        attempt, 
        maxAttempts, 
        delayMs: delay,
        error: error.message 
      });
      
      await sleep(delay);
    }
  }
  
  throw lastError;
}
```

**Retry-After Header Respect** (Source: OpenAI Documentation)

```typescript
// Best Practice: Always respect Retry-After header

function parseRetryAfter(header: string | undefined): number | null {
  if (!header) return null;
  
  // Can be seconds (integer) or HTTP date
  const seconds = parseInt(header);
  if (!isNaN(seconds)) return seconds * 1000;
  
  // Parse HTTP date
  const date = new Date(header);
  if (!isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }
  
  return null;
}
```

### 4. Error Classification

**Comprehensive Error Handling** (Source: OpenAI Best Practices, Production Systems)

```typescript
// Best Practice: Classify errors for appropriate handling

enum ErrorType {
  RATE_LIMIT = 'rate_limit',           // 429 - retry with backoff
  SERVER_ERROR = 'server_error',       // 5xx - retry immediately
  TIMEOUT = 'timeout',                 // Network timeout - retry
  CONTEXT_LENGTH = 'context_length',   // 400 - don't retry, truncate
  CONTENT_FILTER = 'content_filter',   // 400 - don't retry, log
  AUTH_ERROR = 'auth_error',           // 401/403 - don't retry, alert
  QUOTA_EXCEEDED = 'quota_exceeded',   // 429 - don't retry, alert
  ABORT = 'abort',                     // User cancelled - don't retry
  UNKNOWN = 'unknown'                  // Unknown error - retry once
}

function classifyError(error: any): ErrorType {
  if (isAbortError(error)) return ErrorType.ABORT;
  
  const status = error?.status ?? error?.response?.status;
  const message = error?.message?.toLowerCase() || '';
  
  if (status === 429) {
    if (message.includes('quota')) return ErrorType.QUOTA_EXCEEDED;
    return ErrorType.RATE_LIMIT;
  }
  
  if (status >= 500) return ErrorType.SERVER_ERROR;
  if (status === 408 || message.includes('timeout')) return ErrorType.TIMEOUT;
  if (message.includes('context_length')) return ErrorType.CONTEXT_LENGTH;
  if (message.includes('content_filter')) return ErrorType.CONTENT_FILTER;
  if (status === 401 || status === 403) return ErrorType.AUTH_ERROR;
  
  return ErrorType.UNKNOWN;
}

function shouldRetry(errorType: ErrorType): boolean {
  return [
    ErrorType.RATE_LIMIT,
    ErrorType.SERVER_ERROR,
    ErrorType.TIMEOUT,
    ErrorType.UNKNOWN
  ].includes(errorType);
}
```

---

## Queue Management Patterns

### Pattern 1: Per-User Queue Limits

**Problem:** Single user can fill entire queue, starving others  
**Solution:** Limit concurrent requests per user

```typescript
class UserAwareQueue {
  private userRequestCounts = new Map<string, number>();
  private readonly MAX_PER_USER = 5;
  
  async enqueue<T>(
    fn: () => Promise<T>,
    userId: string,
    priority: number
  ): Promise<T> {
    const currentCount = this.userRequestCounts.get(userId) || 0;
    
    if (currentCount >= this.MAX_PER_USER) {
      throw new Error(`User ${userId} has too many concurrent requests`);
    }
    
    this.userRequestCounts.set(userId, currentCount + 1);
    
    try {
      return await this.queue.add(fn, { priority });
    } finally {
      this.userRequestCounts.set(userId, currentCount);
    }
  }
}
```

### Pattern 2: Request Deduplication

**Problem:** Duplicate requests waste API calls and money  
**Solution:** Deduplicate identical in-flight requests

```typescript
class DeduplicatingQueue {
  private inFlightRequests = new Map<string, Promise<any>>();
  
  async enqueue<T>(
    fn: () => Promise<T>,
    requestKey: string,
    priority: number
  ): Promise<T> {
    // Check if identical request is in-flight
    const existing = this.inFlightRequests.get(requestKey);
    if (existing) {
      logger.info('request_deduplicated', { requestKey });
      return existing as Promise<T>;
    }
    
    // Execute and track
    const promise = this.queue.add(fn, { priority });
    this.inFlightRequests.set(requestKey, promise);
    
    // Clean up when done
    promise.finally(() => {
      this.inFlightRequests.delete(requestKey);
    });
    
    return promise;
  }
  
  // Generate key from request parameters
  generateKey(params: any): string {
    return crypto.createHash('md5')
      .update(JSON.stringify(params))
      .digest('hex');
  }
}
```

### Pattern 3: Adaptive Concurrency

**Problem:** Fixed concurrency doesn't adapt to changing conditions  
**Solution:** Adjust concurrency based on error rates and latency

```typescript
class AdaptiveConcurrencyQueue {
  private currentConcurrency: number;
  private errorRate: number = 0;
  private avgLatency: number = 0;
  
  private readonly MIN_CONCURRENCY = 1;
  private readonly MAX_CONCURRENCY = 50;
  private readonly TARGET_ERROR_RATE = 0.01; // 1%
  private readonly TARGET_LATENCY_MS = 2000;
  
  constructor(initialConcurrency: number = 10) {
    this.currentConcurrency = initialConcurrency;
    
    // Adjust every 30 seconds
    setInterval(() => this.adjustConcurrency(), 30000);
  }
  
  private adjustConcurrency() {
    const oldConcurrency = this.currentConcurrency;
    
    // Reduce if error rate too high
    if (this.errorRate > this.TARGET_ERROR_RATE) {
      this.currentConcurrency = Math.max(
        this.MIN_CONCURRENCY,
        Math.floor(this.currentConcurrency * 0.75)
      );
    }
    // Reduce if latency too high
    else if (this.avgLatency > this.TARGET_LATENCY_MS) {
      this.currentConcurrency = Math.max(
        this.MIN_CONCURRENCY,
        Math.floor(this.currentConcurrency * 0.9)
      );
    }
    // Increase if performing well
    else if (this.errorRate < this.TARGET_ERROR_RATE * 0.5 && 
             this.avgLatency < this.TARGET_LATENCY_MS * 0.5) {
      this.currentConcurrency = Math.min(
        this.MAX_CONCURRENCY,
        Math.floor(this.currentConcurrency * 1.1)
      );
    }
    
    if (oldConcurrency !== this.currentConcurrency) {
      logger.info('concurrency_adjusted', {
        old: oldConcurrency,
        new: this.currentConcurrency,
        errorRate: this.errorRate,
        avgLatency: this.avgLatency
      });
      
      // Update p-queue concurrency
      this.queue.concurrency = this.currentConcurrency;
    }
  }
}
```

---

## Rate Limiting Strategies

### Strategy 1: Token-Aware Rate Limiting

**Problem:** Request-based limits don't account for token usage  
**Solution:** Track both requests and tokens

```typescript
class TokenAwareRateLimiter {
  private requestsThisMinute: number = 0;
  private tokensThisMinute: number = 0;
  private windowStart: number = Date.now();
  
  private readonly RPM_LIMIT = 5000;
  private readonly TPM_LIMIT = 2000000;
  
  async checkLimit(estimatedTokens: number): Promise<boolean> {
    this.resetWindowIfNeeded();
    
    // Check both limits
    if (this.requestsThisMinute >= this.RPM_LIMIT) {
      logger.warn('rpm_limit_reached', { requests: this.requestsThisMinute });
      return false;
    }
    
    if (this.tokensThisMinute + estimatedTokens > this.TPM_LIMIT) {
      logger.warn('tpm_limit_reached', { 
        tokens: this.tokensThisMinute,
        estimated: estimatedTokens 
      });
      return false;
    }
    
    return true;
  }
  
  recordRequest(actualTokens: number) {
    this.requestsThisMinute++;
    this.tokensThisMinute += actualTokens;
  }
  
  private resetWindowIfNeeded() {
    const now = Date.now();
    if (now - this.windowStart >= 60000) {
      this.requestsThisMinute = 0;
      this.tokensThisMinute = 0;
      this.windowStart = now;
    }
  }
}
```

### Strategy 2: Sliding Window Rate Limiting

**Problem:** Fixed windows allow bursts at window boundaries  
**Solution:** Use sliding window with Redis

```typescript
class SlidingWindowRateLimiter {
  async checkLimit(
    userId: string,
    limit: number,
    windowMs: number
  ): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - windowMs;
    const key = `rate:${userId}`;
    
    // Add current request with timestamp as score
    await redis.zadd(key, now, `${now}-${Math.random()}`);
    
    // Remove old entries
    await redis.zremrangebyscore(key, 0, windowStart);
    
    // Count requests in window
    const count = await redis.zcard(key);
    
    // Set expiry
    await redis.expire(key, Math.ceil(windowMs / 1000));
    
    return count <= limit;
  }
}
```

---

## Caching Strategies

### Multi-Layer Caching

**Current:** Single Redis layer  
**Best Practice:** Multi-tier caching for different use cases

```typescript
// Layer 1: In-memory cache (fastest, smallest)
const memoryCache = new Map<string, { value: any; expires: number }>();

// Layer 2: Redis cache (fast, shared across instances)
// Already implemented

// Layer 3: Database cache (slowest, persistent)
// For long-term caching of static data

class MultiLayerCache {
  async get<T>(key: string): Promise<T | null> {
    // Check memory first
    const memCached = memoryCache.get(key);
    if (memCached && memCached.expires > Date.now()) {
      return memCached.value as T;
    }
    
    // Check Redis
    const redisCached = await cacheManager.get<T>(key);
    if (redisCached) {
      // Populate memory cache
      memoryCache.set(key, {
        value: redisCached,
        expires: Date.now() + 60000 // 1 minute in memory
      });
      return redisCached;
    }
    
    return null;
  }
  
  async set(key: string, value: any, ttl: number) {
    // Set in both layers
    memoryCache.set(key, {
      value,
      expires: Date.now() + Math.min(ttl * 1000, 60000)
    });
    await cacheManager.set(key, value, ttl);
  }
}
```

### Semantic Caching

**Problem:** Exact key matching misses similar queries  
**Solution:** Use embedding similarity for cache lookups

```typescript
class SemanticCache {
  async get(query: string, threshold: number = 0.95): Promise<any | null> {
    // Generate embedding for query
    const queryEmbedding = await openaiService.generateEmbedding(query);
    
    // Search for similar cached queries
    const similar = await this.findSimilarQueries(queryEmbedding, threshold);
    
    if (similar) {
      logger.info('semantic_cache_hit', { 
        query,
        cachedQuery: similar.query,
        similarity: similar.similarity 
      });
      return similar.response;
    }
    
    return null;
  }
  
  async set(query: string, response: any, ttl: number) {
    const embedding = await openaiService.generateEmbedding(query);
    
    await redis.hset(`semantic:${query}`, {
      query,
      response: JSON.stringify(response),
      embedding: JSON.stringify(embedding),
      expires: Date.now() + (ttl * 1000)
    });
  }
}
```

---

## Monitoring & Observability

### Key Metrics to Track

```typescript
// Queue Metrics
interface QueueMetrics {
  size: number;              // Current queue depth
  pending: number;           // Executing requests
  waitTimeP50: number;       // Median wait time
  waitTimeP95: number;       // 95th percentile wait time
  waitTimeP99: number;       // 99th percentile wait time
  throughput: number;        // Requests/second
  rejectionRate: number;     // % of rejected requests
}

// Request Metrics
interface RequestMetrics {
  latencyP50: number;        // Median latency
  latencyP95: number;        // 95th percentile
  latencyP99: number;        // 99th percentile
  errorRate: number;         // % of failed requests
  errorsByType: Record<ErrorType, number>;
  retryRate: number;         // % of requests that retried
}

// Cost Metrics
interface CostMetrics {
  tokensPerRequest: number;  // Average tokens used
  costPerRequest: number;    // Average cost in USD
  costPerUser: number;       // Cost per user
  cacheHitRate: number;      // % of cache hits
  cacheSavings: number;      // $ saved by caching
}
```

### Prometheus Metrics Export

```typescript
import { Counter, Histogram, Gauge } from 'prom-client';

// Queue metrics
const queueSize = new Gauge({
  name: 'openai_queue_size',
  help: 'Number of requests in queue'
});

const queueWaitTime = new Histogram({
  name: 'openai_queue_wait_seconds',
  help: 'Time requests spend in queue',
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]
});

// Request metrics
const requestDuration = new Histogram({
  name: 'openai_request_duration_seconds',
  help: 'OpenAI request duration',
  labelNames: ['model', 'priority'],
  buckets: [0.5, 1, 2, 5, 10, 30]
});

const requestErrors = new Counter({
  name: 'openai_request_errors_total',
  help: 'OpenAI request errors',
  labelNames: ['error_type', 'model']
});

// Cost metrics
const tokenUsage = new Counter({
  name: 'openai_tokens_total',
  help: 'Total tokens used',
  labelNames: ['type', 'model'] // type: prompt|completion
});

const cacheHits = new Counter({
  name: 'openai_cache_hits_total',
  help: 'Cache hits',
  labelNames: ['cache_type'] // embedding|response|semantic
});
```

---

## Production Deployment Checklist

### Pre-Deployment

- [ ] Environment variables configured in Render
  - [ ] `OPENAI_QUEUE_CONCURRENCY` set based on tier
  - [ ] `OPENAI_QUEUE_RATE_LIMIT` set based on tier
  - [ ] `OPENAI_API_KEY` validated
  - [ ] `REDIS_URL` configured and tested
  
- [ ] Queue configuration validated
  - [ ] Concurrency limit appropriate for tier
  - [ ] Rate limit matches OpenAI tier limits
  - [ ] Priority levels tested
  - [ ] Queue overflow handling tested
  
- [ ] Error handling tested
  - [ ] Rate limit errors retry correctly
  - [ ] Server errors retry with backoff
  - [ ] Timeout errors handled gracefully
  - [ ] Circuit breaker triggers appropriately
  
- [ ] Monitoring configured
  - [ ] Queue metrics exported
  - [ ] Request latency tracked
  - [ ] Error rates monitored
  - [ ] Cost tracking enabled
  - [ ] Alerts configured for anomalies

### Post-Deployment

- [ ] Smoke tests passed
  - [ ] Single request completes successfully
  - [ ] Concurrent requests handled correctly
  - [ ] Priority ordering works
  - [ ] Cache hits working
  
- [ ] Load testing completed
  - [ ] 50 concurrent users: 95%+ success
  - [ ] 100 concurrent users: 95%+ success
  - [ ] Response times under 20 seconds
  - [ ] No rate limit errors
  
- [ ] Monitoring validated
  - [ ] Metrics appearing in dashboard
  - [ ] Alerts triggering correctly
  - [ ] Logs structured and searchable
  - [ ] Cost tracking accurate

### Rollback Plan

- [ ] Feature flag to disable queue (fall back to direct calls)
- [ ] Previous deployment tagged in git
- [ ] Database migrations reversible
- [ ] Cache can be cleared if needed
- [ ] Monitoring shows rollback success

---

## Recommendations for Phase 2

### High Priority

1. **Adaptive Concurrency**
   - Implement dynamic concurrency adjustment based on error rates
   - Target: Automatically scale from 5-50 concurrent based on load
   - Benefit: Better resource utilization, fewer rate limit errors

2. **Token-Aware Rate Limiting**
   - Track both RPM and TPM limits
   - Estimate tokens before queueing
   - Benefit: Prevent TPM limit errors, better cost control

3. **Enhanced Monitoring**
   - Export Prometheus metrics
   - Create Grafana dashboards
   - Set up PagerDuty alerts
   - Benefit: Faster incident response, better visibility

4. **Request Deduplication**
   - Deduplicate identical in-flight requests
   - Benefit: Reduce API costs, faster responses

### Medium Priority

5. **Semantic Caching**
   - Cache similar queries using embedding similarity
   - Benefit: Higher cache hit rate, lower costs

6. **Batch API Integration**
   - Use Batch API for non-urgent requests (explanations)
   - Benefit: 50% cost savings on batch requests

7. **Per-User Limits**
   - Limit concurrent requests per user
   - Benefit: Prevent queue starvation, fairer resource allocation

8. **Dead Letter Queue**
   - Track permanently failed requests
   - Benefit: Better debugging, identify systemic issues

### Low Priority

9. **Multi-Region Deployment**
   - Deploy to multiple regions for lower latency
   - Benefit: Better user experience, higher availability

10. **A/B Testing Framework**
    - Test different queue configurations
    - Benefit: Data-driven optimization decisions

---

## References

### Articles & Documentation

1. **OpenAI API Best Practices** - Zen van Riel  
   https://zenvanriel.nl/ai-engineer-blog/openai-api-best-practices/
   - Retry with backoff and jitter
   - Client-side rate limiting
   - Request batching strategies

2. **Scaling OpenAI Chatbots** - OpenAssistantGPT  
   https://www.openassistantgpt.io/blogs/scaling-openai-chatbots-best-practices-for-high-load
   - Infrastructure optimization
   - Queue system setup
   - Performance tracking

3. **Chatbot Architecture for Speed & Reliability** - Wild.codes  
   https://wild.codes/candidate-toolkit-question/how-to-architect-chatbot-web-apps-for-speed-reliability
   - Sliding-window rate limits
   - Circuit breakers
   - Graceful degradation

4. **Prioritize Requests in High-Load Node.js** - OneUpTime  
   https://oneuptime.com/blog/post/2026-01-25-prioritize-requests-high-load-nodejs/view
   - Priority queue patterns
   - Request prioritization strategies

5. **p-queue Promise Queue Guide** - Generalist Programmer  
   https://generalistprogrammer.com/tutorials/p-queue-npm-package-guide
   - Concurrency control patterns
   - Rate limiting with p-queue

6. **OpenAI Rate Limits Documentation**  
   https://platform.openai.com/docs/guides/rate-limits
   - Official rate limit tiers
   - Best practices from OpenAI

### Internal Documents

- `.kiro/specs/scalability-phase-1-optimizations/design.md`
- `.kiro/specs/scalability-phase-1-optimizations/requirements.md`
- `.kiro/specs/scalability-phase-1-optimizations/tasks.md`

---

## Conclusion

This document consolidates best practices from production systems and research. The current Phase 1 implementation provides a solid foundation with:

- ✅ Priority-based queue management
- ✅ Rate limiting and concurrency control
- ✅ Retry logic with exponential backoff
- ✅ Circuit breaker pattern
- ✅ Graceful degradation

For Phase 2, focus on:
1. Adaptive concurrency
2. Token-aware rate limiting
3. Enhanced monitoring
4. Request deduplication

These improvements will take the system from 200 to 1000+ concurrent users while maintaining 95%+ success rates and controlling costs.

**Content was synthesized from multiple sources for compliance with licensing restrictions. See References section for original sources.**
