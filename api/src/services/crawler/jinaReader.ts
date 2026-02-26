import logger from '../../utils/logger';

/**
 * Jina AI Reader - Simple, fast, LLM-ready web scraping
 * 
 * Benefits:
 * - 100% FREE (no API key needed)
 * - Returns clean markdown (LLM-ready)
 * - No memory issues (API-based)
 * - Fast and reliable
 * - Handles JavaScript
 */

export interface JinaReaderResult {
  url: string;
  title: string;
  content: string; // Clean markdown
  metadata: {
    crawledAt: string;
    contentLength: number;
  };
}

export class JinaReader {
  private readonly JINA_API_BASE = 'https://r.jina.ai';
  private readonly TIMEOUT_MS = 60000; // 60 seconds (Jina AI free tier can be slow)

  /**
   * Scrape a URL using Jina AI Reader
   * Returns clean markdown content ready for LLM consumption
   */
  async scrape(url: string): Promise<JinaReaderResult> {
    logger.info('jina_reader_scrape_start', { url });

    try {
      const startTime = Date.now();
      
      // Jina AI Reader API: Just prepend https://r.jina.ai/ to any URL
      const jinaUrl = `${this.JINA_API_BASE}/${url}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

      const response = await fetch(jinaUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'text/plain', // Request plain text (markdown)
          'X-Return-Format': 'markdown', // Explicitly request markdown
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Jina AI Reader failed: ${response.status} ${response.statusText}`);
      }

      // Get the markdown content
      const markdown = await response.text();
      
      const duration = Date.now() - startTime;

      // Extract title from markdown (first # heading)
      const titleMatch = markdown.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : 'Untitled';

      // Clean up the content (remove excessive whitespace)
      const cleanContent = markdown
        .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
        .trim();

      const result: JinaReaderResult = {
        url,
        title,
        content: cleanContent,
        metadata: {
          crawledAt: new Date().toISOString(),
          contentLength: cleanContent.length,
        },
      };

      logger.info('jina_reader_scrape_success', {
        url,
        title,
        content_length: cleanContent.length,
        duration_ms: duration,
      });

      return result;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        logger.error('jina_reader_timeout', { url, timeout_ms: this.TIMEOUT_MS });
        throw new Error(`Jina AI Reader timeout after ${this.TIMEOUT_MS}ms`);
      }

      logger.error('jina_reader_scrape_error', {
        url,
        error: error.message,
      });

      throw new Error(`Failed to scrape ${url}: ${error.message}`);
    }
  }

  /**
   * Scrape multiple URLs in parallel
   * Returns results for all URLs (failed URLs will have error in content)
   */
  async scrapeMultiple(urls: string[]): Promise<JinaReaderResult[]> {
    logger.info('jina_reader_scrape_multiple', { url_count: urls.length });

    const promises = urls.map(async (url) => {
      try {
        return await this.scrape(url);
      } catch (error: any) {
        // Return error result instead of throwing
        return {
          url,
          title: 'Error',
          content: `Failed to scrape: ${error.message}`,
          metadata: {
            crawledAt: new Date().toISOString(),
            contentLength: 0,
          },
        };
      }
    });

    const results = await Promise.all(promises);

    logger.info('jina_reader_scrape_multiple_complete', {
      total: urls.length,
      successful: results.filter(r => !r.content.startsWith('Failed')).length,
      failed: results.filter(r => r.content.startsWith('Failed')).length,
    });

    return results;
  }
}

// Export singleton instance
export const jinaReader = new JinaReader();
