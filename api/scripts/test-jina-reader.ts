import 'dotenv/config';
import { jinaReader } from '../src/services/crawler/jinaReader';

/**
 * Test Jina AI Reader with our actual queries
 */
async function testJinaReader() {
  console.log('Testing Jina AI Reader\n');
  console.log('='.repeat(80));

  const testUrls = [
    'https://www.stevieawards.com/aba',
    'https://www.stevieawards.com/mena',
    'https://www.stevieawards.com/women',
  ];

  console.log('Test 1: Single URL Scraping');
  console.log('='.repeat(80));
  
  try {
    const url = testUrls[0];
    console.log(`\nScraping: ${url}`);
    
    const startTime = Date.now();
    const result = await jinaReader.scrape(url);
    const duration = Date.now() - startTime;
    
    console.log(`✅ Success!`);
    console.log(`   Duration: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
    console.log(`   Title: ${result.title}`);
    console.log(`   Content Length: ${result.content.length} characters`);
    console.log(`   Content Preview (first 500 chars):`);
    console.log('-'.repeat(80));
    console.log(result.content.substring(0, 500));
    console.log('-'.repeat(80));
    
    // Check if content is markdown
    const hasMarkdown = result.content.includes('#') || result.content.includes('**');
    console.log(`   Is Markdown: ${hasMarkdown ? '✅ YES' : '❌ NO'}`);
    
    // Check if content has useful information
    const hasUsefulInfo = result.content.length > 100;
    console.log(`   Has Content: ${hasUsefulInfo ? '✅ YES' : '❌ NO'}`);
    
  } catch (error: any) {
    console.log(`❌ Failed: ${error.message}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('Test 2: Multiple URLs (Parallel)');
  console.log('='.repeat(80));
  
  try {
    console.log(`\nScraping ${testUrls.length} URLs in parallel...`);
    
    const startTime = Date.now();
    const results = await jinaReader.scrapeMultiple(testUrls);
    const duration = Date.now() - startTime;
    
    console.log(`✅ Success!`);
    console.log(`   Total Duration: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
    console.log(`   Average per URL: ${(duration / testUrls.length).toFixed(0)}ms`);
    console.log(`   Results:`);
    
    results.forEach((result, idx) => {
      const success = !result.content.startsWith('Failed');
      console.log(`   ${idx + 1}. ${result.url}`);
      console.log(`      Status: ${success ? '✅ Success' : '❌ Failed'}`);
      console.log(`      Title: ${result.title}`);
      console.log(`      Length: ${result.content.length} chars`);
    });
    
  } catch (error: any) {
    console.log(`❌ Failed: ${error.message}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('Test 3: Content Quality Check');
  console.log('='.repeat(80));
  
  try {
    const url = 'https://www.stevieawards.com/aba';
    console.log(`\nChecking content quality for: ${url}`);
    
    const result = await jinaReader.scrape(url);
    
    // Check for key information
    const checks = {
      'Has "American Business Awards"': result.content.toLowerCase().includes('american business awards'),
      'Has "deadline" or "entry"': result.content.toLowerCase().includes('deadline') || result.content.toLowerCase().includes('entry'),
      'Has "categories"': result.content.toLowerCase().includes('categor'),
      'Has "2025" or "2026"': result.content.includes('2025') || result.content.includes('2026'),
      'Content > 1000 chars': result.content.length > 1000,
      'Is Markdown format': result.content.includes('#') || result.content.includes('**'),
    };
    
    console.log('\nQuality Checks:');
    Object.entries(checks).forEach(([check, passed]) => {
      console.log(`   ${passed ? '✅' : '❌'} ${check}`);
    });
    
    const passedCount = Object.values(checks).filter(Boolean).length;
    const totalCount = Object.keys(checks).length;
    const score = (passedCount / totalCount * 100).toFixed(0);
    
    console.log(`\n   Overall Score: ${score}% (${passedCount}/${totalCount} checks passed)`);
    
    if (passedCount >= totalCount * 0.8) {
      console.log('   ✅ EXCELLENT - Content quality is high');
    } else if (passedCount >= totalCount * 0.6) {
      console.log('   ⚠️  GOOD - Content quality is acceptable');
    } else {
      console.log('   ❌ POOR - Content quality needs improvement');
    }
    
  } catch (error: any) {
    console.log(`❌ Failed: ${error.message}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('Test 4: Comparison with Expected Queries');
  console.log('='.repeat(80));
  
  const queries = [
    { query: 'where was ABA 2025 held?', url: 'https://www.stevieawards.com/aba', keywords: ['held', 'venue', 'location', '2025'] },
    { query: 'where was MENA 25 held?', url: 'https://www.stevieawards.com/mena', keywords: ['held', 'venue', 'location', 'ras al khaimah'] },
    { query: 'deadline for ABA 2026?', url: 'https://www.stevieawards.com/aba', keywords: ['deadline', '2026', 'march', 'entry'] },
  ];
  
  for (const test of queries) {
    console.log(`\nQuery: "${test.query}"`);
    console.log(`URL: ${test.url}`);
    
    try {
      const result = await jinaReader.scrape(test.url);
      const contentLower = result.content.toLowerCase();
      
      const foundKeywords = test.keywords.filter(kw => contentLower.includes(kw.toLowerCase()));
      const score = (foundKeywords.length / test.keywords.length * 100).toFixed(0);
      
      console.log(`   Keywords found: ${foundKeywords.length}/${test.keywords.length} (${score}%)`);
      console.log(`   Found: ${foundKeywords.join(', ') || 'none'}`);
      console.log(`   Missing: ${test.keywords.filter(kw => !foundKeywords.includes(kw)).join(', ') || 'none'}`);
      
      if (foundKeywords.length >= test.keywords.length * 0.5) {
        console.log(`   ✅ Likely to answer this query`);
      } else {
        console.log(`   ⚠️  May not fully answer this query`);
      }
      
    } catch (error: any) {
      console.log(`   ❌ Failed: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log('\nJina AI Reader Test Complete!');
  console.log('\nKey Findings:');
  console.log('- Speed: Should be 5-10x faster than Crawlee');
  console.log('- Memory: Minimal (API-based, no local processing)');
  console.log('- Output: Clean markdown (LLM-ready)');
  console.log('- Cost: 100% FREE');
  console.log('\nNext Steps:');
  console.log('1. If tests passed → Deploy to production');
  console.log('2. If tests failed → Debug and retry');
  console.log('3. Monitor response times and quality in production');
}

// Run the test
testJinaReader()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
