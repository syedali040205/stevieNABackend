import { openaiService } from '../../api/src/services/openaiService';
import { QueuePriority } from '../../api/src/services/openaiRequestQueue';
import { awardSearchCacheManager } from '../../api/src/services/awardSearchCacheManager';
import logger from '../../api/src/utils/logger';

export interface QueryIntent {
  type: 'category' | 'eligibility' | 'pricing' | 'deadline' | 'process' | 'comparison' | 'general';
  subQuestions: string[];
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

    // Analyze intent using OpenAI
    const intent = await this.analyzeIntent(query);
    
    // Extract keywords
    const keywords = this.extractKeywords(query);
    
    // Generate target URLs based on intent and keywords
    const targetUrls = this.generateTargetUrls(intent, keywords);
    
    // Check cache for existing data (cache-first strategy)
    const cachedUrls = await this.checkCache(targetUrls);
    
    // Determine if comparison is required
    const requiresComparison = intent.type === 'comparison' || 
                               this.detectComparison(query);
    
    // Extract entities for comparison
    const entities = requiresComparison ? this.extractEntities(query, keywords) : [];
    
    // Determine priority
    const priority = this.determinePriority(intent, cachedUrls.length, targetUrls.length);

    const plan: SearchPlan = {
      intent,
      keywords,
      targetUrls,
      requiresComparison,
      entities,
      priority,
      cachedUrls,
    };

    logger.info('query_planner_complete', { 
      intentType: intent.type,
      keywordCount: keywords.length,
      targetUrlCount: targetUrls.length,
      cachedUrlCount: cachedUrls.length,
      requiresComparison,
      priority
    });

    return plan;
  }

  /**
   * Analyze query intent using OpenAI
   * Detects query type and decomposes multi-part questions
   */
  private async analyzeIntent(query: string): Promise<QueryIntent> {
    const systemPrompt = `You are an expert at analyzing questions about Stevie Awards. 
Analyze the user's query and determine:
1. The primary intent type: category, eligibility, pricing, deadline, process, comparison, or general
2. If the query contains multiple sub-questions, list them separately

Respond in JSON format:
{
  "type": "category|eligibility|pricing|deadline|process|comparison|general",
  "subQuestions": ["question 1", "question 2", ...]
}

If the query is a single question, subQuestions should contain just that question.
If the query asks to compare things or find differences, use type "comparison".`;

    const userPrompt = `Analyze this query: "${query}"`;

    try {
      const response = await openaiService.chatCompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        model: 'gpt-4o-mini',
        temperature: 0.3,
        maxTokens: 500,
        priority: QueuePriority.QA
      });

      // Parse JSON response
      const parsed = JSON.parse(response);
      
      return {
        type: parsed.type || 'general',
        subQuestions: parsed.subQuestions || [query]
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
    
    return {
      type,
      subQuestions: subQuestions.length > 0 ? subQuestions : [query]
    };
  }

  /**
   * Extract keywords from query
   * Identifies award programs, topics, and search terms
   */
  private extractKeywords(query: string): string[] {
    const normalized = query.toLowerCase();
    const keywords: string[] = [];

    // Extract award program names
    const programs = ['aba', 'iba', 'sba', 'gsa', 'asia', 'mena'];
    programs.forEach(program => {
      if (normalized.includes(program) || 
          normalized.includes(this.expandAcronym(program))) {
        keywords.push(program);
      }
    });

    // Extract topic keywords
    const topics = [
      'category', 'categories', 
      'price', 'pricing', 'cost', 'fee', 'fees',
      'eligibility', 'eligible', 'qualify', 'qualification',
      'deadline', 'due date', 'submission',
      'nomination', 'nominate', 'entry', 'enter',
      'process', 'procedure', 'how to',
      'award', 'awards', 'winner', 'winners'
    ];
    
    topics.forEach(topic => {
      if (normalized.includes(topic)) {
        keywords.push(topic);
      }
    });

    // Remove duplicates
    return [...new Set(keywords)];
  }

  /**
   * Generate target URLs based on intent and keywords
   * Creates URL patterns for crawling
   */
  private generateTargetUrls(intent: QueryIntent, keywords: string[]): string[] {
    const urls: string[] = [];
    const baseUrl = 'https://www.stevieawards.com';

    // Extract program keywords
    const programs = keywords.filter(k => 
      ['aba', 'iba', 'sba', 'gsa', 'asia', 'mena'].includes(k)
    );

    // If no specific program mentioned, add main site
    if (programs.length === 0) {
      urls.push(baseUrl);
    }

    // Generate URLs based on intent type
    programs.forEach(program => {
      const programPath = `${baseUrl}/${program}`;
      
      switch (intent.type) {
        case 'category':
          urls.push(`${programPath}/categories`);
          urls.push(programPath);
          break;
          
        case 'eligibility':
          urls.push(`${programPath}/eligibility`);
          urls.push(`${programPath}/entry-guidelines`);
          urls.push(programPath);
          break;
          
        case 'pricing':
          urls.push(`${programPath}/entry-fees`);
          urls.push(`${programPath}/pricing`);
          urls.push(programPath);
          break;
          
        case 'deadline':
          urls.push(`${programPath}/deadlines`);
          urls.push(`${programPath}/entry-deadlines`);
          urls.push(programPath);
          break;
          
        case 'process':
          urls.push(`${programPath}/how-to-enter`);
          urls.push(`${programPath}/entry-process`);
          urls.push(programPath);
          break;
          
        case 'comparison':
          // For comparison, add main pages for each program
          urls.push(programPath);
          urls.push(`${programPath}/categories`);
          break;
          
        case 'general':
        default:
          urls.push(programPath);
          break;
      }
    });

    // Remove duplicates
    return [...new Set(urls)];
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
   * Detect if query requires comparison
   */
  private detectComparison(query: string): boolean {
    const normalized = query.toLowerCase();
    const comparisonKeywords = [
      'compare', 'comparison', 'difference', 'differences',
      'versus', 'vs', 'vs.', 'between',
      'which is better', 'which one', 'what is the difference'
    ];
    
    return comparisonKeywords.some(keyword => normalized.includes(keyword));
  }

  /**
   * Extract entities for comparison
   * Identifies award programs, categories, or other entities to compare
   */
  private extractEntities(query: string, keywords: string[]): string[] {
    const entities: string[] = [];
    
    // Extract program entities
    const programs = keywords.filter(k => 
      ['aba', 'iba', 'sba', 'gsa', 'asia', 'mena'].includes(k)
    );
    
    programs.forEach(program => {
      entities.push(this.expandAcronym(program));
    });
    
    // If we found programs, return them
    if (entities.length > 0) {
      return entities;
    }
    
    // Otherwise, try to extract entities from the query
    // Look for quoted strings or capitalized phrases
    const quotedMatches = query.match(/"([^"]+)"/g);
    if (quotedMatches) {
      quotedMatches.forEach(match => {
        entities.push(match.replace(/"/g, ''));
      });
    }
    
    return entities;
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

  /**
   * Expand acronym to full name
   */
  private expandAcronym(acronym: string): string {
    const expansions: Record<string, string> = {
      'aba': 'American Business Awards',
      'iba': 'International Business Awards',
      'sba': 'Stevie Awards for Sales & Customer Service',
      'gsa': 'Stevie Awards for Great Employers',
      'asia': 'Asia-Pacific Stevie Awards',
      'mena': 'Middle East & North Africa Stevie Awards',
    };
    return expansions[acronym] || acronym;
  }
}
