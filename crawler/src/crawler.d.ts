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
export declare class StevieAwardsCrawler {
    private crawler;
    private config;
    constructor(config?: CrawlerConfig);
    /**
     * Crawl the specified URLs and return structured results
     *
     * @param urls - Array of URLs to crawl
     * @returns Array of crawl results
     */
    crawl(urls: string[]): Promise<CrawlResult[]>;
    /**
     * Extract title from page - Requirement 4.1
     *
     * @param $ - Cheerio instance
     * @returns Extracted title
     */
    private extractTitle;
    /**
     * Extract headings from page - Requirement 4.1
     *
     * @param $ - Cheerio instance
     * @returns Array of heading texts
     */
    private extractHeadings;
    /**
     * Extract main content from page - Requirement 4.1
     * Includes paragraphs and list items
     *
     * @param $ - Cheerio instance
     * @returns Normalized content text
     */
    private extractContent;
    /**
     * Extract tables from page - Requirement 4.2
     *
     * @param $ - Cheerio instance
     * @returns Array of table data
     */
    private extractTables;
    /**
     * Extract entities from page content - Requirement 4.5
     * Identifies award names, category names, dates, and prices
     *
     * @param content - Extracted content text
     * @returns Array of extracted entities
     */
    private extractEntities;
    /**
     * Normalize text by removing excessive whitespace - Requirement 4.3
     *
     * @param text - Text to normalize
     * @returns Normalized text
     */
    private normalizeText;
    /**
     * Get context around a match position
     *
     * @param text - Full text
     * @param position - Match position
     * @param contextLength - Length of context to extract
     * @returns Context string
     */
    private getContext;
}
//# sourceMappingURL=crawler.d.ts.map