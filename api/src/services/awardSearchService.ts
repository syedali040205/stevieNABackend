import { QueryPlanner } from './crawler/queryPlanner';
import { StevieAwardsCrawler, CrawlResult } from './crawler/crawler';
import { AnswerSynthesizer } from './crawler/synthesizer';
import { CitationSystem } from './citationSystem';
import { awardSearchCacheManager } from './awardSearchCacheManager';
import { openaiService } from './openaiService';
import { getAwardSearchConfig } from '../config/awardSearch';
import logger from '../utils/logger';
import {
  awardSearchRequestsTotal,
  awardSearchResponseTime,
  awardSearchCrawlRequests,
  awardSearchCacheHitRate,
  awardSearchQueueDepth,
} from '../utils/metrics';

interface QueuedRequest {
  query: string;
  resolve: (result: AwardSearchResult) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

export interface AwardSearchResult {
  success: boolean;
  answer: string;
  citations: Array<{
    url: string;
    title: string;
    snippet: string;
  }>;
  metadata: {
    cacheHit: boolean;
    responseTimeMs: number;
    sourcesUsed: number;
    queryIntent: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

export class AwardSearchService {
  private queue: QueuedRequest[] = [];
  private processing = false;
  private queryPlanner: QueryPlanner;
  private crawler: StevieAwardsCrawler;
  private synthesizer: AnswerSynthesizer;
  private citationSystem: CitationSystem;
  private config = getAwardSearchConfig();

  constructor() {
    this.queryPlanner = new QueryPlanner();
    this.crawler = new StevieAwardsCrawler();
    this.synthesizer = new AnswerSynthesizer(openaiService);
    this.citationSystem = new CitationSystem();
  }

  async search(query: string): Promise<AwardSearchResult> {
    const startTime = Date.now();
    let cacheHit = false;
    let sourcesUsed = 0;
    let queryIntent = 'general';

    try {
      if (this.queue.length >= this.config.AWARD_SEARCH_MAX_QUEUE_DEPTH) {
        awardSearchRequestsTotal.inc({ status: 'rejected', cache_hit: 'false' });
        return {
          success: false,
          answer: '',
          citations: [],
          metadata: {
            cacheHit: false,
            responseTimeMs: Date.now() - startTime,
            sourcesUsed: 0,
            queryIntent: 'unknown',
          },
          error: {
            code: 'QUEUE_FULL',
            message: 'Search service is at capacity. Please try again in a moment.',
          },
        };
      }

      const result = await new Promise<AwardSearchResult>((resolve, reject) => {
        this.queue.push({ query, resolve, reject, timestamp: Date.now() });
        awardSearchQueueDepth.set(this.queue.length);
        if (!this.processing) {
          this.processQueue();
        }
      });

      return result;
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      awardSearchRequestsTotal.inc({ status: 'error', cache_hit: cacheHit ? 'true' : 'false' });
      awardSearchResponseTime.observe({ cache_hit: cacheHit ? 'true' : 'false' }, responseTime / 1000);
      logger.error('award_search_error', { query: query.substring(0, 100), error: error.message, responseTimeMs: responseTime });
      return {
        success: false,
        answer: '',
        citations: [],
        metadata: { cacheHit, responseTimeMs: responseTime, sourcesUsed, queryIntent },
        error: { code: 'INTERNAL_ERROR', message: 'An error occurred while processing your search. Please try again.' },
      };
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const request = this.queue.shift();
      if (!request) break;
      awardSearchQueueDepth.set(this.queue.length);
      try {
        const result = await this.executeSearch(request.query);
        request.resolve(result);
      } catch (error: any) {
        request.reject(error);
      }
    }
    this.processing = false;
  }

  private async executeSearch(query: string): Promise<AwardSearchResult> {
    const startTime = Date.now();
    let cacheHit = false;
    let queryIntent = 'general';
    try {
      logger.info('award_search_start', { query: query.substring(0, 100) });
      const plan = await this.queryPlanner.planSearch(query);
      queryIntent = String(plan.intent.type);
      logger.info('award_search_plan_complete', { intent: plan.intent.type, targetUrls: plan.targetUrls.length, keywords: plan.keywords.slice(0, 5) });
      const cachedResults = await awardSearchCacheManager.getMultiple(plan.targetUrls);
      const cachedUrls = Object.keys(cachedResults);
      const missingUrls = plan.targetUrls.filter((url) => !cachedUrls.includes(url));
      if (cachedUrls.length > 0) {
        logger.info('award_search_cache_hit', { cachedCount: cachedUrls.length, missingCount: missingUrls.length });
      }
      const crawlResults: CrawlResult[] = [];
      if (missingUrls.length > 0) {
        logger.info('award_search_crawling', { urlCount: missingUrls.length });
        try {
          awardSearchCrawlRequests.inc({ status: 'started' });
          const results = await this.crawler.crawl(missingUrls);
          crawlResults.push(...results);
          awardSearchCrawlRequests.inc({ status: 'success' });
          for (const result of results) {
            await awardSearchCacheManager.set(result.url, result);
          }
        } catch (error: any) {
          awardSearchCrawlRequests.inc({ status: 'error' });
          logger.warn('award_search_crawl_failed', { error: error.message });
        }
      }
      const allResults: CrawlResult[] = [...Object.values(cachedResults), ...crawlResults];
      cacheHit = missingUrls.length === 0 && cachedUrls.length > 0;
      if (allResults.length === 0) throw new Error('No results found for query');
      const synthesized = await this.synthesizer.synthesize(query, allResults);
      const cited = await this.citationSystem.addCitations(synthesized.answer, allResults);
      const responseTime = Date.now() - startTime;
      awardSearchRequestsTotal.inc({ status: 'success', cache_hit: cacheHit ? 'true' : 'false' });
      awardSearchResponseTime.observe({ cache_hit: cacheHit ? 'true' : 'false' }, responseTime / 1000);
      awardSearchCacheHitRate.set(cacheHit ? 1 : 0);
      logger.info('award_search_complete', { query: query.substring(0, 100), cacheHit, responseTimeMs: responseTime, sourcesUsed: allResults.length });
      return {
        success: true,
        answer: cited.answer,
        citations: cited.citations.map((c: any) => ({ url: c.url, title: c.title, snippet: c.snippet })),
        metadata: { cacheHit, responseTimeMs: responseTime, sourcesUsed: allResults.length, queryIntent },
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      awardSearchRequestsTotal.inc({ status: 'error', cache_hit: cacheHit ? 'true' : 'false' });
      awardSearchResponseTime.observe({ cache_hit: cacheHit ? 'true' : 'false' }, responseTime / 1000);
      logger.error('award_search_error', { query: query.substring(0, 100), error: error.message, responseTimeMs: responseTime });
      throw error;
    }
  }

  getQueueDepth(): number {
    return this.queue.length;
  }

  async checkHealth(): Promise<boolean> {
    try {
      await awardSearchCacheManager.get('health-check-url');
      return true;
    } catch (error) {
      logger.error('award_search_health_check_failed', { error });
      return false;
    }
  }
}

export const awardSearchService = new AwardSearchService();
