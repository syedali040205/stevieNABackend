/**
 * Web Search Service
 * 
 * Provides real web search capabilities using Tavily API (free tier: 1000 searches/month)
 * 
 * This solves the problem of only scraping known URLs - now we can actually
 * search the web to find relevant pages first, then scrape them.
 */

import axios from 'axios';
import logger from '../utils/logger';
import { jinaReader } from './crawler/jinaReader';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

export interface WebSearchResponse {
  query: string;
  results: WebSearchResult[];
  answer?: string; // Tavily can provide a synthesized answer
}

class WebSearchService {
  private readonly TAVILY_API_KEY = process.env.TAVILY_API_KEY;
  private readonly TAVILY_API_URL = 'https://api.tavily.com/search';

  /**
   * Search the web using Tavily API
   */
  async search(query: string, options: {
    maxResults?: number;
    includeAnswer?: boolean;
    searchDepth?: 'basic' | 'advanced';
  } = {}): Promise<WebSearchResponse> {
    const {
      maxResults = 5,
      includeAnswer = true,
      searchDepth = 'basic',
    } = options;

    logger.info('web_search_start', { query, maxResults, searchDepth });

    try {
      if (!this.TAVILY_API_KEY) {
        throw new Error('TAVILY_API_KEY not configured');
      }
      return await this.searchWithTavily(query, maxResults, includeAnswer, searchDepth);
    } catch (error: any) {
      logger.error('web_search_error', { 
        query, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Search using Tavily API (AI-optimized search)
   */
  private async searchWithTavily(
    query: string,
    maxResults: number,
    includeAnswer: boolean,
    searchDepth: 'basic' | 'advanced'
  ): Promise<WebSearchResponse> {
    try {
      const response = await axios.post(
        this.TAVILY_API_URL,
        {
          api_key: this.TAVILY_API_KEY,
          query,
          max_results: maxResults,
          search_depth: searchDepth,
          include_answer: includeAnswer,
          include_raw_content: false, // We'll use Jina AI for scraping
        },
        {
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const results: WebSearchResult[] = response.data.results.map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
        score: r.score,
      }));

      logger.info('web_search_tavily_success', {
        query,
        resultsCount: results.length,
        hasAnswer: !!response.data.answer,
      });

      return {
        query,
        results,
        answer: response.data.answer,
      };
    } catch (error: any) {
      logger.error('web_search_tavily_error', {
        query,
        error: error.message,
        status: error.response?.status,
      });
      throw new Error(`Tavily search failed: ${error.message}`);
    }
  }

  /**
   * Search and scrape: Find relevant pages, then scrape their content
   * This is the main method to use for award search queries
   */
  async searchAndScrape(query: string, options: {
    maxResults?: number;
    maxScrape?: number;
  } = {}): Promise<{
    query: string;
    searchResults: WebSearchResult[];
    scrapedContent: Array<{
      url: string;
      title: string;
      content: string;
    }>;
    answer?: string;
  }> {
    const { maxResults = 5, maxScrape = 3 } = options;

    logger.info('web_search_and_scrape_start', { query, maxResults, maxScrape });

    // Step 1: Search the web
    const searchResponse = await this.search(query, { maxResults });

    // Step 2: Scrape top results
    const urlsToScrape = searchResponse.results
      .slice(0, maxScrape)
      .map(r => r.url);

    logger.info('web_search_scraping_urls', { 
      query, 
      urlCount: urlsToScrape.length 
    });

    const scrapedResults = await jinaReader.scrapeMultiple(urlsToScrape);

    const scrapedContent = scrapedResults.map(r => ({
      url: r.url,
      title: r.title,
      content: r.content,
    }));

    logger.info('web_search_and_scrape_complete', {
      query,
      searchResultsCount: searchResponse.results.length,
      scrapedCount: scrapedContent.length,
    });

    return {
      query,
      searchResults: searchResponse.results,
      scrapedContent,
      answer: searchResponse.answer,
    };
  }
}

export const webSearchService = new WebSearchService();
