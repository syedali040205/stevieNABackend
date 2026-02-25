import { CheerioCrawler, Dataset, log as crawleeLog, type CheerioAPI } from 'crawlee';

crawleeLog.setLevel(crawleeLog.LEVELS.INFO);

/**
 * Extracted entity from crawled content
 */
export interface ExtractedEntity {
  type: 'award' | 'category' | 'date' | 'price';
  value: string;
  context: string;
}

/**
 * Extracted table data from crawled content
 */
export interface TableData {
  headers: string[];
  rows: string[][];
}

/**
 * Result of a crawl operation
 */
export interface CrawlResult {
  url: string;
  title: string;
  content: string;
  headings: string[];
  tables: TableData[];
  entities: ExtractedEntity[];
  metadata: {
    crawledAt: string;
    contentType: string;
    depth: number;
  };
}

/**
 * Configuration for the StevieAwardsCrawler
 */
export interface CrawlerConfig {
  maxRequestsPerCrawl?: number;
  maxConcurrency?: number;
  requestDelay?: number;
  maxDepth?: number;
  userAgent?: string;
}

/**
 * StevieAwardsCrawler - Production-grade web crawler for stevieawards.com
 * 
 * Features:
 * - Rate limiting with configurable delays
 * - Automatic retries with exponential backoff
 * - Depth-limited link following
 * - Content extraction (title, headings, paragraphs, lists, tables)
 * - Text normalization
 * - Entity extraction (awards, categories, dates, prices)
 * - Custom User-Agent header
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8, 4.1, 4.2, 4.3, 4.5, 8.4
 */
export class StevieAwardsCrawler {
  private crawler: CheerioCrawler;
  private config: Required<CrawlerConfig>;

  constructor(config: CrawlerConfig = {}) {
    this.config = {
      maxRequestsPerCrawl: config.maxRequestsPerCrawl ?? 10,
      maxConcurrency: config.maxConcurrency ?? 2,
      requestDelay: config.requestDelay ?? 1000,
      maxDepth: config.maxDepth ?? 1,
      userAgent: config.userAgent ?? 'StevieAwardsSearchBot/1.0 (Award Search Assistant)',
    };

    this.crawler = new CheerioCrawler({
      maxRequestsPerCrawl: this.config.maxRequestsPerCrawl,
      maxConcurrency: this.config.maxConcurrency,
      requestHandlerTimeoutSecs: 30,
      
      // Respectful crawling - Requirement 3.3, 3.5, 8.1
      minConcurrency: 1,
      maxRequestRetries: 3,
      
      // Set custom User-Agent header - Requirement 8.4
      preNavigationHooks: [
        async ({ request }) => {
          request.headers = {
            ...request.headers,
            'User-Agent': this.config.userAgent,
          };
        },
      ],
      
      requestHandler: async ({ request, $, enqueueLinks, log }) => {
        log.info(`Crawling: ${request.url}`);

        // Extract title - Requirement 4.1
        const title = this.extractTitle($);

        // Extract headings - Requirement 4.1
        const headings = this.extractHeadings($);

        // Extract main content - Requirement 4.1
        const content = this.extractContent($);

        // Extract tables - Requirement 4.2
        const tables = this.extractTables($);

        // Extract entities - Requirement 4.5
        const entities = this.extractEntities(content);

        // Get current depth - Requirement 3.7
        const currentDepth = (request.userData.depth as number) || 0;

        // Save result - Requirement 3.8
        const result: CrawlResult = {
          url: request.url,
          title,
          content,
          headings,
          tables,
          entities,
          metadata: {
            crawledAt: new Date().toISOString(),
            contentType: 'text/html',
            depth: currentDepth,
          },
        };

        await Dataset.pushData(result);

        // Enqueue links if within depth limit - Requirement 3.7
        if (currentDepth < this.config.maxDepth) {
          await enqueueLinks({
            globs: [
              'https://www.stevieawards.com/**',
            ],
            exclude: [
              '**/*.pdf',
              '**/*.jpg',
              '**/*.png',
              '**/*.zip',
              '**/login*',
              '**/register*',
              '**/cart*',
            ],
            userData: { depth: currentDepth + 1 },
          });
        }

        // Respect rate limiting - Requirement 3.3, 8.1
        await new Promise(resolve => setTimeout(resolve, this.config.requestDelay));
      },

      failedRequestHandler({ request, log }) {
        log.error(`Failed to crawl: ${request.url}`);
      },
    });
  }

  /**
   * Crawl the specified URLs and return structured results
   * 
   * @param urls - Array of URLs to crawl
   * @returns Array of crawl results
   */
  async crawl(urls: string[]): Promise<CrawlResult[]> {
    // Initialize URLs with depth 0
    const urlsWithDepth = urls.map(url => ({
      url,
      userData: { depth: 0 },
    }));

    await this.crawler.run(urlsWithDepth);
    
    // Get results from dataset
    const dataset = await Dataset.open();
    const { items } = await dataset.getData();
    
    return items as CrawlResult[];
  }

  /**
   * Extract title from page - Requirement 4.1
   * 
   * @param $ - Cheerio instance
   * @returns Extracted title
   */
  private extractTitle($: CheerioAPI): string {
    return $('title').text().trim() || $('h1').first().text().trim() || '';
  }

  /**
   * Extract headings from page - Requirement 4.1
   * 
   * @param $ - Cheerio instance
   * @returns Array of heading texts
   */
  private extractHeadings($: CheerioAPI): string[] {
    const headings: string[] = [];
    $('h1, h2, h3').each((_, el) => {
      const text = $(el).text().trim();
      if (text) {
        headings.push(this.normalizeText(text));
      }
    });
    return headings;
  }

  /**
   * Extract main content from page - Requirement 4.1
   * Includes paragraphs and list items
   * 
   * @param $ - Cheerio instance
   * @returns Normalized content text
   */
  private extractContent($: CheerioAPI): string {
    const contentParts: string[] = [];
    const maxContentLength = 5000; // Limit total content to reduce memory usage
    let currentLength = 0;
    
    // Get paragraphs
    const paragraphs = $('p').toArray();
    for (const el of paragraphs) {
      if (currentLength >= maxContentLength) break;
      
      const text = $(el).text().trim();
      if (text && text.length > 20) {
        const normalized = this.normalizeText(text);
        contentParts.push(normalized);
        currentLength += normalized.length;
      }
    }

    // Get list items if we still have space
    if (currentLength < maxContentLength) {
      const listItems = $('li').toArray();
      for (const el of listItems) {
        if (currentLength >= maxContentLength) break;
        
        const text = $(el).text().trim();
        if (text && text.length > 10) {
          const normalized = this.normalizeText(text);
          contentParts.push(normalized);
          currentLength += normalized.length;
        }
      }
    }

    return contentParts.join('\n\n');
  }

  /**
   * Extract tables from page - Requirement 4.2
   * 
   * @param $ - Cheerio instance
   * @returns Array of table data
   */
  private extractTables($: CheerioAPI): TableData[] {
    const tables: TableData[] = [];

    $('table').each((_, tableEl) => {
      const headers: string[] = [];
      const rows: string[][] = [];

      // Extract headers
      $(tableEl).find('thead th, thead td').each((_, headerEl) => {
        headers.push(this.normalizeText($(headerEl).text()));
      });

      // If no thead, try first row
      if (headers.length === 0) {
        $(tableEl).find('tr').first().find('th, td').each((_, headerEl) => {
          headers.push(this.normalizeText($(headerEl).text()));
        });
      }

      // Extract rows
      $(tableEl).find('tbody tr, tr').each((_, rowEl) => {
        const row: string[] = [];
        $(rowEl).find('td').each((_, cellEl) => {
          row.push(this.normalizeText($(cellEl).text()));
        });
        if (row.length > 0) {
          rows.push(row);
        }
      });

      if (headers.length > 0 || rows.length > 0) {
        tables.push({ headers, rows });
      }
    });

    return tables;
  }

  /**
   * Extract entities from page content - Requirement 4.5
   * Identifies award names, category names, dates, and prices
   * 
   * @param content - Extracted content text
   * @returns Array of extracted entities
   */
  private extractEntities(content: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    // Extract award names (common patterns)
    const awardPatterns = [
      /Stevie Awards? for ([^.]+)/gi,
      /The ([^.]+) Stevie Awards?/gi,
      /(International Business Awards?|American Business Awards?|Asia-Pacific Stevie Awards?|German Stevie Awards?|Middle East & North Africa Stevie Awards?)/gi,
    ];

    awardPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        entities.push({
          type: 'award',
          value: match[1] || match[0],
          context: this.getContext(content, match.index, 50),
        });
      }
    });

    // Extract category names (look for "category" keyword)
    const categoryPattern = /(?:category|categories):\s*([^.\n]+)/gi;
    let match;
    while ((match = categoryPattern.exec(content)) !== null) {
      entities.push({
        type: 'category',
        value: match[1].trim(),
        context: this.getContext(content, match.index, 50),
      });
    }

    // Extract dates (various formats)
    const datePatterns = [
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
      /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g,
      /\b\d{4}-\d{2}-\d{2}\b/g,
    ];

    datePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        entities.push({
          type: 'date',
          value: match[0],
          context: this.getContext(content, match.index, 50),
        });
      }
    });

    // Extract prices (USD format)
    const pricePattern = /\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g;
    while ((match = pricePattern.exec(content)) !== null) {
      entities.push({
        type: 'price',
        value: match[0],
        context: this.getContext(content, match.index, 50),
      });
    }

    return entities;
  }

  /**
   * Normalize text by removing excessive whitespace - Requirement 4.3
   * 
   * @param text - Text to normalize
   * @returns Normalized text
   */
  private normalizeText(text: string): string {
    return text
      .replace(/\s+/g, ' ')  // Replace multiple whitespace with single space
      .replace(/\n\s*\n/g, '\n')  // Remove excessive newlines
      .trim();
  }

  /**
   * Get context around a match position
   * 
   * @param text - Full text
   * @param position - Match position
   * @param contextLength - Length of context to extract
   * @returns Context string
   */
  private getContext(text: string, position: number, contextLength: number): string {
    const start = Math.max(0, position - contextLength);
    const end = Math.min(text.length, position + contextLength);
    return text.substring(start, end).trim();
  }
}
