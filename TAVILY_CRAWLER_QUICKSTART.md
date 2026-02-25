# Tavily Crawler - Quick Start Guide

## 🚀 Setup (5 minutes)

### 1. Get Tavily API Key

1. Visit [https://tavily.com](https://tavily.com)
2. Sign up for free account (1,000 credits/month)
3. Get your API key from dashboard

### 2. Configure Environment

Add to `.env`:

```bash
TAVILY_API_KEY=tvly-xxxxxxxxxxxxxxxxxxxxx
```

### 3. Register Route

Add to `api/src/index.ts`:

```typescript
import crawlerRouter from './routes/crawler';

// After other routes
app.use('/api/crawler', crawlerRouter);
```

### 4. Test Installation

```bash
# Run example script
npx ts-node api/scripts/example-tavily-crawl.ts
```

---

## 📖 Basic Usage

### Simple Crawl

```typescript
import { tavilyCrawler } from './services/tavilyCrawler';

const result = await tavilyCrawler.crawl({
  url: 'https://docs.example.com',
  maxDepth: 2,
  limit: 50,
});

console.log(`Crawled ${result.totalPages} pages`);
```

### API Request

```bash
curl -X POST http://localhost:3000/api/crawler/crawl \
  -H "Content-Type: application/json" \
  -H "X-Internal-API-Key: your_internal_key" \
  -d '{
    "url": "https://docs.example.com",
    "maxDepth": 2,
    "maxBreadth": 30,
    "limit": 100
  }'
```

---

## 🎯 Common Use Cases

### 1. Documentation Crawl

```typescript
await tavilyCrawler.crawl({
  url: 'https://docs.example.com',
  maxDepth: 2,
  selectPaths: ['/docs/.*', '/api/.*'],
  extractDepth: 'advanced',
  limit: 200,
});
```

### 2. Blog Archive

```typescript
await tavilyCrawler.crawl({
  url: 'https://blog.example.com',
  maxDepth: 3,
  selectPaths: ['/blog/.*', '/posts/.*'],
  excludePaths: ['/tag/.*', '/author/.*'],
  limit: 500,
});
```

### 3. Focused Search

```typescript
await tavilyCrawler.crawl({
  url: 'https://example.com',
  instructions: 'Find all pages about Python API documentation',
  chunksPerSource: 3,
  maxDepth: 2,
  limit: 100,
});
```

---

## ⚙️ Configuration Guide

### Conservative (Fast, Low Cost)

```typescript
{
  maxDepth: 1,        // Single level
  maxBreadth: 20,     // 20 links per page
  limit: 50,          // Max 50 pages
  extractDepth: 'basic'
}
```

**Use for**: Quick scans, testing, low-budget crawls

### Moderate (Balanced)

```typescript
{
  maxDepth: 2,        // Two levels deep
  maxBreadth: 50,     // 50 links per page
  limit: 200,         // Max 200 pages
  extractDepth: 'basic'
}
```

**Use for**: Documentation, blog archives, standard crawls

### Aggressive (Comprehensive)

```typescript
{
  maxDepth: 3,        // Three levels deep
  maxBreadth: 100,    // 100 links per page
  limit: 1000,        // Max 1000 pages
  extractDepth: 'advanced'
}
```

**Use for**: Complete site crawls, audits, large-scale extraction

---

## 🔧 Troubleshooting

### Rate Limit Errors

**Problem**: `429 Too Many Requests`

**Solution**:
```typescript
// Reduce batch size or add delays
// The crawler handles this automatically
```

### Slow Performance

**Problem**: Crawl takes too long

**Solution**:
```typescript
// Reduce maxDepth (biggest impact)
{
  maxDepth: 1,  // Instead of 3
  limit: 50     // Instead of 500
}
```

### Memory Issues

**Problem**: High memory usage

**Solution**:
```typescript
// Use chunksPerSource to limit content
{
  instructions: 'Find relevant pages',
  chunksPerSource: 3,  // Limit content size
  limit: 100           // Reduce total pages
}
```

---

## 📊 Performance Tips

### 1. Use Caching

Crawls are automatically cached for 1 hour. Repeated crawls are instant.

### 2. Start Small

```typescript
// Test with small crawl first
{
  maxDepth: 1,
  limit: 10
}

// Then scale up
{
  maxDepth: 2,
  limit: 100
}
```

### 3. Filter Aggressively

```typescript
// Only crawl what you need
{
  selectPaths: ['/docs/.*'],
  excludePaths: ['/private/.*', '/admin/.*']
}
```

### 4. Use Instructions

```typescript
// Semantic filtering reduces unnecessary pages
{
  instructions: 'Find API documentation only',
  chunksPerSource: 3
}
```

---

## 💰 Cost Estimation

### Free Tier (1,000 credits/month)

- **Conservative**: ~20 crawls (50 pages each)
- **Moderate**: ~5 crawls (200 pages each)
- **Aggressive**: ~1 crawl (1000 pages)

### Paid Tiers

- **Project ($30/month)**: 4,000 credits
- **Bootstrap ($100/month)**: 15,000 credits
- **Startup ($220/month)**: 38,000 credits

---

## 🔒 Security Checklist

- [ ] Store API key in environment variables
- [ ] Never commit `.env` to version control
- [ ] Use internal API authentication
- [ ] Validate all user inputs
- [ ] Implement rate limiting
- [ ] Monitor API usage

---

## 📚 Next Steps

1. Read full documentation: `TAVILY_CRAWLER_DOCUMENTATION.md`
2. Run example script: `npx ts-node api/scripts/example-tavily-crawl.ts`
3. Test API endpoint: `POST /api/crawler/crawl`
4. Monitor logs for performance insights
5. Adjust configuration based on needs

---

## 🆘 Support

- **Documentation**: See `TAVILY_CRAWLER_DOCUMENTATION.md`
- **Tavily Docs**: https://docs.tavily.com
- **Issues**: Report via GitHub Issues

---

## ✅ Quick Reference

### Key Parameters

| Parameter | Range | Default | Impact |
|-----------|-------|---------|--------|
| maxDepth | 1-5 | 1 | Exponential cost |
| maxBreadth | 1-200 | 20 | Horizontal spread |
| limit | 1-1000 | 50 | Hard cap |
| extractDepth | basic/advanced | basic | Quality vs speed |

### Rate Limits

- **Crawl Endpoint**: 100 requests/minute
- **Development Key**: 100 RPM
- **Production Key**: 100 RPM

### Response Times

- **Single page**: ~500-1000ms
- **10 pages**: ~5-10 seconds
- **50 pages**: ~30-60 seconds
- **100 pages**: ~1-2 minutes

---

**Ready to crawl? Start with the examples above!** 🕷️
