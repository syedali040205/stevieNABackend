import { CheerioCrawler, Dataset, log as crawleeLog } from 'crawlee';

// Set log level
crawleeLog.setLevel(crawleeLog.LEVELS.INFO);

interface AwardCategory {
  name: string;
  url: string;
  description?: string;
}

interface AwardProgram {
  name: string;
  url: string;
  categories: AwardCategory[];
}

interface CrawlResult {
  url: string;
  title: string;
  type: 'homepage' | 'program' | 'category';
  programs?: AwardProgram[];
  categories?: AwardCategory[];
  content?: string;
  timestamp: string;
}

console.log('🚀 Starting Stevie Awards Crawler...\n');

// Main crawler for stevieawards.com
const crawler = new CheerioCrawler({
  maxRequestsPerCrawl: 100,
  maxConcurrency: 3,
  requestHandlerTimeoutSecs: 30,
  
  async requestHandler({ request, $, enqueueLinks, log }) {
    log.info(`📄 Processing: ${request.url}`);

    const title = $('title').text().trim();
    const url = request.url;
    
    const result: CrawlResult = {
      url,
      title,
      type: 'homepage',
      timestamp: new Date().toISOString(),
    };

    // Detect page type
    if (url.includes('/categor')) {
      result.type = 'category';
      
      // Extract category details
      const categoryName = $('h1').first().text().trim();
      const description = $('p').first().text().trim();
      
      result.categories = [{
        name: categoryName || title,
        url,
        description: description || undefined,
      }];
      
      log.info(`  ✓ Category: ${categoryName}`);
      
    } else if (url.match(/\/(aba|iba|sba|gsa|asia|mena)/)) {
      result.type = 'program';
      
      // Extract award program info
      const programName = $('h1').first().text().trim();
      const categories: AwardCategory[] = [];
      
      // Find category links
      $('a').each((_, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        
        if (href && text && (
          href.includes('categor') || 
          text.toLowerCase().includes('categor')
        )) {
          const fullUrl = href.startsWith('http') ? href : `https://www.stevieawards.com${href}`;
          if (!categories.find(c => c.url === fullUrl)) {
            categories.push({
              name: text,
              url: fullUrl,
            });
          }
        }
      });
      
      result.programs = [{
        name: programName || title,
        url,
        categories: categories.slice(0, 50), // Limit to 50 categories per program
      }];
      
      log.info(`  ✓ Program: ${programName} (${categories.length} categories)`);
      
    } else {
      // Homepage - extract award programs
      const programs: AwardProgram[] = [];
      
      $('a').each((_, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        
        if (href && text && href.match(/\/(aba|iba|sba|gsa|asia|mena)/)) {
          const fullUrl = href.startsWith('http') ? href : `https://www.stevieawards.com${href}`;
          if (!programs.find(p => p.url === fullUrl)) {
            programs.push({
              name: text,
              url: fullUrl,
              categories: [],
            });
          }
        }
      });
      
      result.programs = programs;
      log.info(`  ✓ Found ${programs.length} award programs`);
    }

    // Save the result
    await Dataset.pushData(result);

    // Enqueue links to award programs and categories
    await enqueueLinks({
      globs: [
        'https://www.stevieawards.com/*/categor*',
        'https://www.stevieawards.com/aba*',
        'https://www.stevieawards.com/iba*',
        'https://www.stevieawards.com/sba*',
        'https://www.stevieawards.com/gsa*',
        'https://www.stevieawards.com/asia*',
        'https://www.stevieawards.com/mena*',
      ],
      exclude: [
        '**/*.pdf',
        '**/*.jpg',
        '**/*.png',
        '**/login*',
        '**/register*',
      ],
    });
  },

  failedRequestHandler({ request, log }) {
    log.error(`❌ Request failed: ${request.url}`);
  },
});

// Run the crawler
try {
  await crawler.run(['https://www.stevieawards.com']);
  
  console.log('\n✅ Crawler finished successfully!');
  console.log('📁 Results saved to: ./storage/datasets/default/');
  console.log('\nTo view results, check the JSON files in the storage folder.');
  
} catch (error) {
  console.error('\n❌ Crawler failed:', error);
  process.exit(1);
}
