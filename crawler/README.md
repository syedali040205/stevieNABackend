# Stevie Awards Crawler

Production-grade web crawler for stevieawards.com built with Crawlee.

## Features

- **Fast HTTP Crawling**: Uses CheerioCrawler for efficient data extraction
- **Smart Link Discovery**: Automatically finds award programs and categories
- **Structured Data**: Extracts programs, categories, and descriptions
- **Production Ready**: Built-in retry logic, rate limiting, and error handling
- **Scalable**: Handles concurrent requests with configurable workers

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Test the Setup

```bash
npm test
```

This runs a quick test to verify Crawlee is working correctly.

### 3. Run the Crawler

```bash
npm run crawl
```

The crawler will:
- Start at stevieawards.com homepage
- Discover all award programs (ABA, IBA, SBA, GSA, etc.)
- Extract categories from each program
- Save structured data to `./storage/datasets/default/`

## Output

Results are saved as JSON files in `storage/datasets/default/`. Each entry contains:

```json
{
  "url": "https://www.stevieawards.com/aba",
  "title": "American Business Awards",
  "type": "program",
  "programs": [{
    "name": "American Business Awards",
    "url": "https://www.stevieawards.com/aba",
    "categories": [
      {
        "name": "Company of the Year",
        "url": "https://www.stevieawards.com/aba/categories/..."
      }
    ]
  }],
  "timestamp": "2026-02-25T18:00:00.000Z"
}
```

## Configuration

Edit `crawlee-crawler.ts` to customize:

- `maxRequestsPerCrawl`: Limit total pages (default: 100)
- `maxConcurrency`: Number of parallel workers (default: 3)
- `requestHandlerTimeoutSecs`: Timeout per request (default: 30s)
- URL patterns to crawl
- Data extraction selectors

## Architecture

- **CheerioCrawler**: Fast HTTP-based crawler (no browser overhead)
- **Request Queue**: Automatic deduplication and retry logic
- **Dataset Storage**: Structured JSON output
- **Link Enqueuing**: Smart discovery of related pages

## Production Deployment

For production scale (1M+ users):

1. **Deploy on Kubernetes** with multiple crawler pods
2. **Use Apify Platform** for managed infrastructure
3. **Add proxy rotation** (e.g., DataImpulse) to avoid rate limits
4. **Implement caching** to reduce redundant crawls
5. **Set up monitoring** with metrics and alerts

## Troubleshooting

**Crawler hangs or times out:**
- Check network connectivity
- Verify the site is accessible
- Increase `requestHandlerTimeoutSecs`

**Missing data:**
- Inspect the HTML structure of target pages
- Adjust CSS selectors in the crawler
- Check browser console for JavaScript-rendered content

**Rate limiting:**
- Reduce `maxConcurrency`
- Add delays between requests
- Use proxy rotation

## Tech Stack

- **Crawlee**: Modern web scraping framework
- **Cheerio**: Fast HTML parsing
- **TypeScript**: Type-safe development
- **tsx**: Fast TypeScript execution

## License

MIT
