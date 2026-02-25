/**
 * Example script demonstrating Tavily Crawler usage
 * 
 * Run with: npx ts-node api/scripts/example-tavily-crawl.ts
 */

import { tavilyCrawler } from '../src/services/tavilyCrawler';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('🕷️  Tavily Crawler Examples\n');

  // Example 1: Basic Crawl
  console.log('Example 1: Basic Crawl');
  console.log('─'.repeat(50));
  try {
    const result1 = await tavilyCrawler.crawl({
      url: 'https://docs.tavily.com',
      maxDepth: 1,
      maxBreadth: 10,
      limit: 20,
    });

    console.log(`✅ Crawled ${result1.totalPages} pages in ${result1.duration}ms`);
    console.log(`   Failed URLs: ${result1.failedUrls.length}`);
    console.log(`   Avg time per page: ${Math.round(result1.duration / result1.totalPages)}ms\n`);
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}\n`);
  }

  // Example 2: Focused Crawl with Instructions
  console.log('Example 2: Focused Crawl with Instructions');
  console.log('─'.repeat(50));
  try {
    const result2 = await tavilyCrawler.crawl({
      url: 'https://docs.tavily.com',
      maxDepth: 2,
      instructions: 'Find all API documentation pages',
      chunksPerSource: 3,
      extractDepth: 'advanced',
      limit: 30,
    });

    console.log(`✅ Crawled ${result2.totalPages} pages in ${result2.duration}ms`);
    console.log(`   Sample result:`);
    if (result2.results.length > 0) {
      const sample = result2.results[0];
      console.log(`   - URL: ${sample.url}`);
      console.log(`   - Title: ${sample.title}`);
      console.log(`   - Content length: ${sample.content.length} chars`);
      console.log(`   - Links found: ${sample.links.length}\n`);
    }
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}\n`);
  }

  // Example 3: Path-Filtered Crawl
  console.log('Example 3: Path-Filtered Crawl');
  console.log('─'.repeat(50));
  try {
    const result3 = await tavilyCrawler.crawl({
      url: 'https://docs.tavily.com',
      maxDepth: 2,
      selectPaths: ['/documentation/.*', '/guides/.*'],
      excludePaths: ['/changelog/.*'],
      limit: 25,
    });

    console.log(`✅ Crawled ${result3.totalPages} pages in ${result3.duration}ms`);
    console.log(`   URLs crawled:`);
    result3.results.slice(0, 5).forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.url} (depth: ${r.depth})`);
    });
    console.log();
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}\n`);
  }

  // Example 4: Performance Comparison
  console.log('Example 4: Performance Comparison');
  console.log('─'.repeat(50));
  
  const configs = [
    { name: 'Conservative', maxDepth: 1, maxBreadth: 10, limit: 20 },
    { name: 'Moderate', maxDepth: 2, maxBreadth: 20, limit: 50 },
    { name: 'Aggressive', maxDepth: 2, maxBreadth: 50, limit: 100 },
  ];

  for (const config of configs) {
    try {
      const start = Date.now();
      const result = await tavilyCrawler.crawl({
        url: 'https://docs.tavily.com',
        maxDepth: config.maxDepth,
        maxBreadth: config.maxBreadth,
        limit: config.limit,
      });
      const duration = Date.now() - start;

      console.log(`${config.name}:`);
      console.log(`  - Pages: ${result.totalPages}`);
      console.log(`  - Duration: ${duration}ms`);
      console.log(`  - Avg/page: ${Math.round(duration / result.totalPages)}ms`);
      console.log(`  - Failed: ${result.failedUrls.length}`);
      console.log();
    } catch (error: any) {
      console.error(`${config.name}: ❌ ${error.message}\n`);
    }
  }

  // Example 5: Cache Performance
  console.log('Example 5: Cache Performance Test');
  console.log('─'.repeat(50));
  try {
    // First crawl (no cache)
    const start1 = Date.now();
    const result1 = await tavilyCrawler.crawl({
      url: 'https://docs.tavily.com',
      maxDepth: 1,
      limit: 15,
    });
    const duration1 = Date.now() - start1;

    // Second crawl (cached)
    const start2 = Date.now();
    const result2 = await tavilyCrawler.crawl({
      url: 'https://docs.tavily.com',
      maxDepth: 1,
      limit: 15,
    });
    const duration2 = Date.now() - start2;

    console.log(`First crawl (no cache): ${duration1}ms`);
    console.log(`Second crawl (cached): ${duration2}ms`);
    console.log(`Speedup: ${Math.round((duration1 / duration2) * 100) / 100}x faster\n`);
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}\n`);
  }

  console.log('✨ All examples completed!');
}

main().catch(console.error);
