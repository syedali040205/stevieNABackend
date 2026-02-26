import { openaiService } from '../openaiService';
import { QueuePriority } from '../openaiRequestQueue';
import { awardSearchCacheManager } from '../awardSearchCacheManager';
import logger from '../../utils/logger';

export interface QueryIntent {
  type: 'category' | 'eligibility' | 'pricing' | 'deadline' | 'process' | 'comparison' | 'general';
  subQuestions: string[];
  detectedPrograms: string[];
  suggestedUrls: string[];
}

export interface SearchPlan {
  intent: QueryIntent;
  keywords: string[];
  targetUrls: string[];
  requiresComparison: boolean;
  entities: string[];
  priority: 'high' | 'medium' | 'low';
  cachedUrls?: string[];
}

export class QueryPlanner {
  /**
   * Plan search strategy for a user query
   * Uses OpenAI to analyze intent and generate search strategy
   * Implements cache-first strategy
   */
  async planSearch(query: string): Promise<SearchPlan> {
    logger.info('query_planner_start', { query });

    // Analyze intent using OpenAI - LLM determines everything
    const intent = await this.analyzeIntent(query);
    
    // Use LLM-suggested URLs
    const targetUrls = intent.suggestedUrls;
    
    // Check cache for existing data (cache-first strategy)
    const cachedUrls = await this.checkCache(targetUrls);
    
    // Determine if comparison is required
    const requiresComparison = intent.type === 'comparison';
    
    // Use detected programs as entities
    const entities = intent.detectedPrograms;
    
    // Determine priority
    const priority = this.determinePriority(intent, cachedUrls.length, targetUrls.length);

    const plan: SearchPlan = {
      intent,
      keywords: intent.detectedPrograms,
      targetUrls,
      requiresComparison,
      entities,
      priority,
      cachedUrls,
    };

    logger.info('query_planner_complete', { 
      intentType: intent.type,
      programsDetected: intent.detectedPrograms,
      targetUrlCount: targetUrls.length,
      cachedUrlCount: cachedUrls.length,
      requiresComparison,
      priority
    });

    return plan;
  }

  /**
   * Analyze query intent using OpenAI
   * LLM determines intent, programs, and starting URL for crawling
   */
  private async analyzeIntent(query: string): Promise<QueryIntent> {
    const systemPrompt = `You are an expert at analyzing questions about Stevie Awards and determining the best starting page for web crawling.

Known Stevie Awards programs and their base URLs:
- American Business Awards (ABA): https://www.stevieawards.com/aba
- International Business Awards (IBA): https://www.stevieawards.com/iba
- Stevie Awards for Sales & Customer Service: https://www.stevieawards.com/sba
- Stevie Awards for Great Employers: https://www.stevieawards.com/gsa
- Asia-Pacific Stevie Awards: https://www.stevieawards.com/asia
- Middle East & North Africa Stevie Awards (MENA): https://www.stevieawards.com/mena
- Stevie Awards for Women in Business (SAWIB/WIB): https://www.stevieawards.com/women
- German Stevie Awards: https://www.stevieawards.com/german
- Stevie Awards for Technology Excellence (SATE): https://www.stevieawards.com/tech

Main site: https://www.stevieawards.com

Your task:
1. Identify the intent type: category, eligibility, pricing, deadline, process, comparison, or general
2. Detect which Stevie Awards program(s) the user is asking about
3. Suggest 1-2 STARTING URLs where the crawler should begin
   - The crawler will automatically discover and follow relevant links from these pages
   - Choose pages that are likely to have links to the information needed
   - For program-specific questions, suggest the main program page
   - For general questions, suggest the main site
4. Break down multi-part questions into sub-questions

Respond in JSON format:
{
  "type": "category|eligibility|pricing|deadline|process|comparison|general",
  "subQuestions": ["question 1", "question 2", ...],
  "detectedPrograms": ["program name 1", "program name 2", ...],
  "suggestedUrls": ["starting_url1", "starting_url2"]
}`;

    const userPrompt = `Analyze this query and suggest 1-2 starting URLs for crawling: "${query}"`;

    try {
      const response = await openaiService.chatCompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        model: 'gpt-4o-mini',
        temperature: 0.3,
        maxTokens: 800,
        priority: QueuePriority.QA
      });

      // Parse JSON response
      const parsed = JSON.parse(response);
      
      return {
        type: parsed.type || 'general',
        subQuestions: parsed.subQuestions || [query],
        detectedPrograms: parsed.detectedPrograms || [],
        suggestedUrls: parsed.suggestedUrls || ['https://www.stevieawards.com']
      };
    } catch (error: any) {
      logger.error('query_planner_intent_analysis_error', { 
        query, 
        error: error.message 
      });
      
      // Fallback to simple heuristics
      return this.fallbackIntentAnalysis(query);
    }
  }

  /**
   * Fallback intent analysis using simple heuristics
   * Used when OpenAI is unavailable
   */
  private fallbackIntentAnalysis(query: string): QueryIntent {
    const normalized = query.toLowerCase();
    
    let type: QueryIntent['type'] = 'general';
    
    if (normalized.includes('categor')) {
      type = 'category';
    } else if (normalized.includes('eligib') || normalized.includes('qualify')) {
      type = 'eligibility';
    } else if (normalized.includes('price') || normalized.includes('cost') || 
               normalized.includes('fee')) {
      type = 'pricing';
    } else if (normalized.includes('deadline') || normalized.includes('due date')) {
      type = 'deadline';
    } else if (normalized.includes('process') || normalized.includes('how to') || 
               normalized.includes('nominate') || normalized.includes('enter')) {
      type = 'process';
    } else if (normalized.includes('compare') || normalized.includes('difference') || 
               normalized.includes('versus') || normalized.includes('vs')) {
      type = 'comparison';
    }
    
    // Simple multi-question detection
    const subQuestions = query.split(/[?;]/).filter(q => q.trim().length > 0);
    
    // Fallback URL
    const suggestedUrls = ['https://www.stevieawards.com'];
    
    return {
      type,
      subQuestions: subQuestions.length > 0 ? subQuestions : [query],
      detectedPrograms: [],
      suggestedUrls
    };
  }

  /**
   * Check cache for existing data
   * Returns URLs that have valid cached data
   */
  private async checkCache(urls: string[]): Promise<string[]> {
    if (urls.length === 0) {
      return [];
    }

    try {
      const cachedData = await awardSearchCacheManager.getMultiple(urls);
      const cachedUrls = Array.from(cachedData.keys());
      
      logger.debug('query_planner_cache_check', { 
        totalUrls: urls.length,
        cachedUrls: cachedUrls.length
      });
      
      return cachedUrls;
    } catch (error: any) {
      logger.error('query_planner_cache_check_error', { 
        error: error.message 
      });
      return [];
    }
  }

  /**
   * Determine search priority based on intent and cache status
   */
  private determinePriority(
    intent: QueryIntent, 
    cachedCount: number, 
    totalCount: number
  ): 'high' | 'medium' | 'low' {
    // High priority if mostly cached (fast response)
    if (cachedCount >= totalCount * 0.8) {
      return 'high';
    }
    
    // High priority for simple queries
    if (intent.subQuestions.length === 1 && totalCount <= 2) {
      return 'high';
    }
    
    // Low priority for complex multi-part queries
    if (intent.subQuestions.length > 3 || totalCount > 5) {
      return 'low';
    }
    
    return 'medium';
  }
}
