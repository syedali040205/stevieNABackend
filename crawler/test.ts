import { CheerioCrawler } from 'crawlee';

console.log('🧪 Testing Crawlee setup with example.com...\n');

const testCrawler = new CheerioCrawler({
  maxRequestsPerCrawl: 1,
  requestHandlerTimeoutSecs: 10,
  
  async requestHandler({ request, $, log }) {
    const title = $('title').text();
    const h1 = $('h1').text();
    const linksCount = $('a').length;
    
    console.log('✅ Crawlee is working!');
    console.log(`   URL: ${request.url}`);
    console.log(`   Title: ${title}`);
    console.log(`   H1: ${h1}`);
    console.log(`   Links: ${linksCount}`);
  },
});

try {
  await testCrawler.run(['https://example.com']);
  console.log('\n✅ Test passed! Ready to crawl stevieawards.com');
} catch (error) {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
}
