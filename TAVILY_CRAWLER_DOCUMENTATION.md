# Tavily Crawler - Production-Grade Web Crawler

## Overview

A production-grade web crawler built on Tavily API with enterprise-level features including breadth-first crawling, low latency, rate limiting, circuit breaker, caching, and comprehensive error handling.

---

## Features

### Core Capabilities
- ✅ **Breadth-First Crawling**: Explores web pages level by level for comprehensive coverage
- ✅ **Low Latency**: Parallel processing with optimized request batching
- ✅ **Rate Limiting**: Respects Tavily's 100 RPM limit with intelligent queuing
- ✅ **Circuit Breaker**: Automatic failure detection and recovery
- ✅ **Caching**: Redis-based caching to avoid redundant crawls
- ✅ **Deduplication**: Prevents crawling the same URL multiple times
- ✅ **Retry Logic**: Exponential backoff for transient failures
- ✅ **Error Handling**: Comprehensive error tracking and reporting

### Advanced Features
- 🎯 **Semantic Filtering**: Use natural language instructions to focus crawls
- 🔍 **Path Filtering**: Include/exclude specific URL patterns
- 🌐 **Domain Filtering**: Control which domains to crawl
- 📊 **Content Extraction**: Basic or advanced extraction modes
- 🖼️ **Image Support**: Optional image URL extraction
- 📦 **Chunked Content**: Control content size with chunks_per_source

---

## Architecture

### Breadth-First Strategy

```
Level 0: [Root URL]
           ↓
Level 1: [Link1] [Link2] [Link3] ... [LinkN]
           ↓       ↓       ↓           ↓
Level 2: [...]   [...]   [...]      [...]
```

**Benefits**:
- Discovers important pages faster (closer to root)
- Better for site structure understanding
- More predictable resource usage
- Easier to limit crawl scope

### Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Tavily Crawler Service                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Priority   │  │     Rate     │  │   Circuit    │      │
│  │    Queue     │  │   Limiter    │  │   Breaker    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │    Cache     │  │     Retry    │  │  Dedup Set   │      │
│  │   Manager    │  │    Logic     │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    ┌───────────────┐
                    │  Tavily API   │
                    │  (100 RPM)    │
                    └───────────────┘
```

---

## Installation

### 1. Install Dependencies

```bash
npm install axios
```

### 2. Set Environment Variables

```bash
# .env
TAVILY_API_KEY=your_tavily_api_key_here
```

### 3. Register Route

Add to `api/src/index.ts`:

```typescript
import crawlerRouter from './routes/crawler';

// ... other routes
app.use('/api/crawler', crawlerRouter);
```

---

## API Reference

### POST /api/crawler/crawl

Crawl a website with configurable options.

**Authentication**: Requires internal API key

**Request Body**:

```typescript
{
  // Required
  url: string;                    // Starting URL to crawl
  
  // Crawl Strategy
  maxDepth?: number;              // Max levels deep (1-5, default: 1)
  maxBreadth?: number;            // Max links per page (1-200, default: 20)
  limit?: number;                 // Max total pages (1-1000, default: 50)
  
  // Semantic Filtering
  instructions?: string;          // Natural language instructions
  chunksPerSource?: number;       // Max chunks per page (requires instructions)
  
  // Path Filtering
  selectPaths?: string[];         // Regex patterns to include
  excludePaths?: string[];        // Regex patterns to exclude
  
  // Domain Filtering
  selectDomains?: string[];       // Regex patterns for domains to include
  excludeDomains?: string[];      // Regex patterns for domains to exclude
  
  // Extraction Options
  extractDepth?: 'basic' | 'advanced';  // Extraction quality (default: 'basic')
  includeImages?: boolean;        // Include image URLs (default: false)
}
```

**Response**:

```typescript
{
  success: true,
  data: {
    results: [
      {
        url: string;
        title: string;
        content: string;
        rawContent?: string;
        links: string[];
        images?: string[];
        depth: number;
        timestamp: string;
      }
    ],
    failedUrls: string[];
    totalPages: number;
    duration: number;  // milliseconds
  },
  timestamp: string;
}
```

### GET /api/crawler/health

Check crawler service health.

**Response**:

```typescript
{
  success: boolean;
  service: 'tavily-crawler';
  status: 'healthy' | 'unhealthy';
  timestamp: string;
}
```

---

## Usage Examples

### Example 1: Basic Crawl

```typescript
const response = await fetch('http://localhost:3000/api/crawler/crawl', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Internal-API-Key': process.env.INTERNAL_API_KEY,
  },
  body: JSON.stringify({
    url: 'https://docs.example.com',
    maxDepth: 2,
    maxBreadth: 30,
    limit: 100,
  }),
});

const data = await response.json();
console.log(`Crawled ${data.data.totalPages} pages in ${data.data.duration}ms`);
```

### Example 2: Focused Crawl with Instructions

```typescript
const response = await fetch('http://localhost:3000/api/crawler/crawl', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Internal-API-Key': process.env.INTERNAL_API_KEY,
  },
  body: JSON.stringify({
    url: 'https://docs.example.com',
    maxDepth: 2,
    instructions: 'Find all API documentation pages',
    chunksPerSource: 3,
    extractDepth: 'advanced',
  }),
});
```

### Example 3: Path-Filtered Crawl

```typescript
const response = await fetch('http://localhost:3000/api/crawler/crawl', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Internal-API-Key': process.env.INTERNAL_API_KEY,
  },
  body: JSON.stringify({
    url: 'https://example.com',
    maxDepth: 3,
    selectPaths: ['/blog/.*', '/docs/.*'],
    excludePaths: ['/private/.*', '/admin/.*'],
  }),
});
```

### Example 4: Domain-Restricted Crawl

```typescript
const response = await fetch('http://localhost:3000/api/crawler/crawl', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Internal-API-Key': process.env.INTERNAL_API_KEY,
  },
  body: JSON.stringify({
    url: 'https://docs.example.com',
    maxDepth: 2,
    selectDomains: ['^docs\\.example\\.com$'],
    excludeDomains: ['^ads\\.example\\.com$'],
  }),
});
```

---

## Best Practices

### 1. Start Conservative

```typescript
// Good: Start small and scale up
{
  url: 'https://example.com',
  maxDepth: 1,
  maxBreadth: 20,
  limit: 50
}

// Bad: Too aggressive
{
  url: 'https://example.com',
  maxDepth: 5,
  maxBreadth: 200,
  limit: 1000
}
```

### 2. Use Instructions for Focus

```typescript
// Good: Focused crawl
{
  url: 'https://docs.example.com',
  instructions: 'Find all Python API documentation',
  chunksPerSource: 3
}

// Bad: Unfocused crawl
{
  url: 'https://docs.example.com',
  maxDepth: 3,
  limit: 500
}
```

### 3. Filter Paths Aggressively

```typescript
// Good: Targeted paths
{
  url: 'https://example.com',
  selectPaths: ['/docs/.*', '/api/.*'],
  excludePaths: ['/private/.*', '/admin/.*', '/test/.*']
}
```

### 4. Monitor Performance

```typescript
const result = await tavilyCrawler.crawl(options);

console.log('Performance Metrics:');
console.log(`- Total pages: ${result.totalPages}`);
console.log(`- Failed URLs: ${result.failedUrls.length}`);
console.log(`- Duration: ${result.duration}ms`);
console.log(`- Avg time per page: ${result.duration / result.totalPages}ms`);
```

---

## Performance Optimization

### Rate Limiting Strategy

The crawler implements intelligent rate limiting:

```typescript
// Tavily crawl endpoint: 100 RPM
// Strategy: Track timestamps, wait if needed

private async waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  
  // Remove old timestamps
  this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);
  
  // Wait if at limit
  if (this.requestTimestamps.length >= this.MAX_RPM) {
    const waitTime = 60000 - (now - this.requestTimestamps[0]) + 100;
    await this.delay(waitTime);
  }
}
```

### Parallel Processing

```typescript
// Process URLs in batches of 5
const batchSize = Math.min(5, this.requestQueue.length);
const batch = this.requestQueue.splice(0, batchSize);

await Promise.all(
  batch.map(item => this.processUrl(item, options))
);
```

### Caching Strategy

```typescript
// Cache key format
const cacheKey = `tavily:crawl:${url}:${maxDepth}:${maxBreadth}:${limit}`;

// Cache TTL: 1 hour
await cacheManager.set(cacheKey, result, 3600);
```

---

## Error Handling

### Circuit Breaker

Automatically opens after 5 consecutive failures:

```typescript
// Circuit breaker configuration
private readonly FAILURE_THRESHOLD = 5;
private readonly CIRCUIT_RESET_TIMEOUT = 60000; // 1 minute

// Opens circuit on threshold
if (this.failureCount >= this.FAILURE_THRESHOLD) {
  this.openCircuit();
}

// Auto-resets after timeout
if (now - this.circuitOpenTime > this.CIRCUIT_RESET_TIMEOUT) {
  this.closeCircuit();
}
```

### Retry Logic

Exponential backoff for transient failures:

```typescript
// Rate limit (429): 1s, 2s, 4s
// Server error (5xx): 0.5s, 1s, 2s
const backoffMs = Math.pow(2, attempt) * baseDelay;
await this.delay(backoffMs);
```

### Failed URL Tracking

```typescript
// Track failed URLs
this.failedUrls.add(url);

// Return in response
{
  results: [...],
  failedUrls: Array.from(this.failedUrls),
  totalPages: this.results.length
}
```

---

## Monitoring & Observability

### Logging Events

```typescript
// Crawl lifecycle
logger.info('tavily_crawl_started', { url, maxDepth, limit });
logger.info('tavily_crawl_completed', { totalPages, duration });

// Rate limiting
logger.info('tavily_rate_limit_wait', { waitTimeMs });
logger.warn('tavily_rate_limit_hit', { url, attempt, backoffMs });

// Circuit breaker
logger.warn('tavily_circuit_breaker_open', { failureCount });
logger.info('tavily_circuit_breaker_closed');

// Errors
logger.error('tavily_crawl_error', { url, error, depth });
```

### Metrics to Track

- **Throughput**: Pages crawled per minute
- **Latency**: Average time per page
- **Success Rate**: Successful pages / total attempts
- **Cache Hit Rate**: Cached responses / total requests
- **Circuit Breaker**: Open/closed state, failure count
- **Queue Size**: Current queue length

---

## Cost Optimization

### Tavily Pricing

- **Free Tier**: 1,000 credits/month
- **Basic Search**: 1 credit per request
- **Advanced Search**: 2 credits per request
- **Crawl**: Variable (depends on pages crawled)

### Cost Reduction Strategies

1. **Use Caching**: Avoid redundant crawls (1 hour TTL)
2. **Start with Basic Extraction**: Use `extractDepth: 'basic'` first
3. **Limit Depth**: Each level increases cost exponentially
4. **Use Instructions**: Focus crawls to reduce unnecessary pages
5. **Set Reasonable Limits**: Cap `limit` parameter appropriately

### Cost Estimation

```typescript
// Conservative crawl
{
  maxDepth: 1,
  maxBreadth: 20,
  limit: 50
}
// Estimated: 50 pages × 1 credit = 50 credits

// Aggressive crawl
{
  maxDepth: 3,
  maxBreadth: 100,
  limit: 500
}
// Estimated: 500 pages × 1 credit = 500 credits
```

---

## Troubleshooting

### Issue: Rate Limit Errors

**Symptom**: `429 Too Many Requests` errors

**Solution**:
- Reduce batch size (default: 5)
- Increase delay between batches
- Check rate limit tracking logic

### Issue: Circuit Breaker Opens

**Symptom**: Crawl stops with "circuit breaker open" message

**Solution**:
- Check Tavily API status
- Review failed URLs for patterns
- Adjust failure threshold if needed
- Wait for circuit to reset (1 minute)

### Issue: Slow Crawl Performance

**Symptom**: Crawl takes too long

**Solution**:
- Reduce `maxDepth` (exponential impact)
- Reduce `maxBreadth` per page
- Use path/domain filters to focus crawl
- Enable caching for repeated crawls

### Issue: Memory Issues

**Symptom**: High memory usage or OOM errors

**Solution**:
- Reduce `limit` parameter
- Use `chunksPerSource` to limit content size
- Process results incrementally
- Clear visited URLs set periodically

---

## Security Considerations

### API Key Protection

```typescript
// Store in environment variables
TAVILY_API_KEY=your_key_here

// Never commit to version control
// Add to .gitignore
.env
.env.local
```

### Internal API Authentication

```typescript
// Require internal API key for crawler endpoint
router.post('/crawl', internalAuth, async (req, res) => {
  // ...
});
```

### Input Validation

```typescript
// Validate URL format
try {
  new URL(url);
} catch (error) {
  return res.status(400).json({ error: 'Invalid URL' });
}

// Validate depth and breadth
if (maxDepth < 1 || maxDepth > 5) {
  return res.status(400).json({ error: 'Invalid maxDepth' });
}
```

### Rate Limiting

```typescript
// Respect Tavily's rate limits
private readonly MAX_RPM = 100;

// Implement request throttling
await this.waitForRateLimit();
```

---

## Testing

### Unit Tests

```typescript
describe('TavilyCrawler', () => {
  it('should crawl a single page', async () => {
    const result = await tavilyCrawler.crawl({
      url: 'https://example.com',
      maxDepth: 1,
      limit: 1,
    });
    
    expect(result.totalPages).toBeGreaterThan(0);
    expect(result.results[0]).toHaveProperty('url');
    expect(result.results[0]).toHaveProperty('content');
  });
  
  it('should respect rate limits', async () => {
    // Test rate limiting logic
  });
  
  it('should open circuit breaker on failures', async () => {
    // Test circuit breaker
  });
});
```

### Integration Tests

```typescript
describe('Crawler API', () => {
  it('should crawl with valid request', async () => {
    const response = await request(app)
      .post('/api/crawler/crawl')
      .set('X-Internal-API-Key', process.env.INTERNAL_API_KEY)
      .send({
        url: 'https://example.com',
        maxDepth: 1,
        limit: 10,
      });
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.totalPages).toBeGreaterThan(0);
  });
});
```

---

## Roadmap

### Planned Features

- [ ] **Distributed Crawling**: Multi-worker support for large-scale crawls
- [ ] **Webhook Support**: Async crawl with callback URL
- [ ] **Crawl Scheduling**: Cron-based recurring crawls
- [ ] **Content Deduplication**: Detect and skip duplicate content
- [ ] **Sitemap Integration**: Use sitemaps for efficient crawling
- [ ] **Robots.txt Respect**: Honor robots.txt directives
- [ ] **Custom Headers**: Support for authentication headers
- [ ] **Proxy Support**: Rotate proxies for large crawls
- [ ] **Progress Tracking**: Real-time crawl progress updates
- [ ] **Export Formats**: JSON, CSV, XML export options

---

## Support

### Documentation
- [Tavily API Docs](https://docs.tavily.com)
- [Tavily Best Practices](https://docs.tavily.com/documentation/best-practices/best-practices-crawl)

### Issues
- Report bugs via GitHub Issues
- Feature requests welcome

### Contact
- Email: support@example.com
- Slack: #crawler-support

---

## License

MIT License - See LICENSE file for details

---

## Changelog

### v1.0.0 (2026-02-25)
- Initial release
- Breadth-first crawling strategy
- Rate limiting and circuit breaker
- Caching and deduplication
- Comprehensive error handling
- Production-ready implementation
