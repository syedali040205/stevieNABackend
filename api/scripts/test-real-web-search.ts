/**
 * Test Real Web Search Integration
 * 
 * This demonstrates the difference between:
 * 1. OLD: Only scraping known URLs (limited to stevieawards.com)
 * 2. NEW: Real web search that finds relevant pages across the internet
 */

import { config } from 'dotenv';
import { resolve } from 'path';

const envPath = resolve(__dirname, '../.env');
config({ path: envPath });

import { webSearchService } from '../src/services/webSearchService';

async function testRealWebSearch() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    REAL WEB SEARCH TEST                                    ║');
  console.log('║              Search the ENTIRE WEB, not just known URLs                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log();

  const testQueries = [
    {
      query: 'where was Stevie Awards MENA 2025 held location venue',
      description: 'Event location - should find news articles, press releases, etc.',
    },
    {
      query: 'American Business Awards 2026 deadline entry date',
      description: 'Deadline info - should find official pages and announcements',
    },
    {
      query: 'Stevie Awards for Women in Business 2025 winners ceremony location',
      description: 'Winners ceremony location - should find event coverage',
    },
  ];

  for (let i = 0; i < testQueries.length; i++) {
    const test = testQueries[i];
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`TEST ${i + 1}/${testQueries.length}: ${test.description}`);
    console.log('═'.repeat(80));
    console.log(`Query: "${test.query}"`);
    console.log('-'.repeat(80));

    try {
      const startTime = Date.now();

      // Perform web search and scrape
      const result = await webSearchService.searchAndScrape(test.query, {
        maxResults: 5,
        maxScrape: 3,
      });

      const duration = Date.now() - startTime;

      console.log(`✅ SUCCESS`);
      console.log(`\nPerformance:`);
      console.log(`  Total Duration: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
      console.log(`  Search Results Found: ${result.searchResults.length}`);
      console.log(`  Pages Scraped: ${result.scrapedContent.length}`);

      if (result.answer) {
        console.log(`\nTavily Quick Answer:`);
        console.log(`  ${result.answer}`);
      }

      console.log(`\nSearch Results:`);
      result.searchResults.forEach((r, idx) => {
        console.log(`  ${idx + 1}. ${r.title}`);
        console.log(`     URL: ${r.url}`);
        if (r.snippet) {
          console.log(`     Snippet: ${r.snippet.substring(0, 100)}...`);
        }
        if (r.score) {
          console.log(`     Relevance Score: ${(r.score * 100).toFixed(1)}%`);
        }
      });

      console.log(`\nScraped Content Preview:`);
      result.scrapedContent.forEach((page, idx) => {
        console.log(`\n  Page ${idx + 1}: ${page.title}`);
        console.log(`  URL: ${page.url}`);
        console.log(`  Content Length: ${page.content.length} characters`);
        console.log(`  Preview: ${page.content.substring(0, 200)}...`);
      });

    } catch (error: any) {
      console.log(`❌ FAILED: ${error.message}`);
      
      if (error.message.includes('TAVILY_API_KEY')) {
        console.log(`\n⚠️  Tavily API key not configured!`);
        console.log(`   Get a FREE API key at: https://tavily.com`);
        console.log(`   Add to api/.env: TAVILY_API_KEY=your_key_here`);
        console.log(`   Free tier: 1000 searches/month`);
        console.log(`\n   Falling back to DuckDuckGo (less reliable)...`);
      }
    }
  }

  console.log('\n\n');
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                              SUMMARY                                       ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log();
  console.log('Key Differences:');
  console.log();
  console.log('OLD APPROACH (Just Jina AI):');
  console.log('  ❌ Only scrapes URLs you already know');
  console.log('  ❌ Limited to stevieawards.com');
  console.log('  ❌ Can\'t find information on other sites');
  console.log('  ❌ Misses news articles, press releases, etc.');
  console.log();
  console.log('NEW APPROACH (Web Search + Jina AI):');
  console.log('  ✅ Searches the ENTIRE WEB (Google, Bing, etc.)');
  console.log('  ✅ Finds relevant pages automatically');
  console.log('  ✅ Discovers news articles, press releases, event pages');
  console.log('  ✅ Scrapes top results with Jina AI');
  console.log('  ✅ Provides relevance scores');
  console.log('  ✅ Can synthesize answers from multiple sources');
  console.log();
  console.log('Setup:');
  console.log('  1. Get FREE Tavily API key: https://tavily.com');
  console.log('  2. Add to api/.env: TAVILY_API_KEY=your_key_here');
  console.log('  3. Free tier: 1000 searches/month (plenty for testing)');
  console.log('  4. Falls back to DuckDuckGo if not configured');
  console.log();
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    TEST COMPLETED                                          ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log();
}

testRealWebSearch().catch((error) => {
  console.error('\n❌ FATAL ERROR:', error.message);
  console.error(error.stack);
  process.exit(1);
});
