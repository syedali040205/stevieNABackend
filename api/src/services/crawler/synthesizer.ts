import { CrawlResult } from './crawler';

export interface SynthesizedAnswer {
  answer: string;
  citations: Citation[];
  confidence: 'high' | 'medium' | 'low';
  sources: number;
  missingInfo?: string[];
}

export interface Citation {
  text: string;
  url: string;
  title: string;
}

/**
 * Interface for OpenAI service integration
 * Matches the signature of the existing openaiService.chatCompletion() method
 */
export interface OpenAIService {
  chatCompletion(params: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
    priority?: any;
  }): Promise<string>;
}

/**
 * AnswerSynthesizer generates comprehensive answers from crawled data using LLM
 * 
 * Features:
 * - Combines information from multiple sources
 * - Structures complex answers with clear sections
 * - Detects and indicates missing information
 * - Falls back to raw data when LLM service unavailable
 * 
 * Requirements: 5.1, 5.2, 5.4, 5.5, 11.3
 */
export class AnswerSynthesizer {
  constructor(private openaiService?: OpenAIService) {}

  /**
   * Synthesize a comprehensive answer from crawled data
   * 
   * This method:
   * 1. Combines information from multiple sources
   * 2. Uses LLM to generate natural language answers
   * 3. Falls back to raw data if LLM unavailable
   * 4. Structures complex answers with sections
   * 5. Detects and indicates missing information
   * 
   * @param query - The user's natural language question
   * @param crawlResults - Array of crawled pages with content
   * @returns Synthesized answer with citations and metadata
   * 
   * Requirements: 5.1, 5.2, 5.4, 5.5, 11.3
   */
  async synthesize(query: string, crawlResults: CrawlResult[]): Promise<SynthesizedAnswer> {
    if (crawlResults.length === 0) {
      return {
        answer: 'I could not find information to answer your question. Please try rephrasing or check stevieawards.com directly.',
        citations: [],
        confidence: 'low',
        sources: 0,
        missingInfo: ['No relevant pages found'],
      };
    }

    // Detect missing information
    const missingInfo = this.detectMissingInfo(crawlResults);
    
    // Try to use LLM for answer generation
    let answer: string;
    try {
      if (this.openaiService) {
        answer = await this.generateAnswerWithLLM(query, crawlResults);
      } else {
        // Fallback to raw data when LLM service unavailable
        answer = this.generateAnswerFromRawData(query, crawlResults);
      }
    } catch (error) {
      // Fallback to raw data when LLM service fails (Requirement 11.3)
      answer = this.generateAnswerFromRawData(query, crawlResults);
    }
    
    // Structure answer for complex queries
    const structuredAnswer = this.structureAnswer(answer, query, crawlResults);
    
    // Create citations
    const citations = this.createCitations(crawlResults);

    return {
      answer: structuredAnswer,
      citations,
      confidence: this.assessConfidence(crawlResults.length, missingInfo.length),
      sources: crawlResults.length,
      missingInfo: missingInfo.length > 0 ? missingInfo : undefined,
    };
  }

  /**
   * Build LLM prompt with crawled content
   * 
   * Constructs a comprehensive prompt that:
   * - Includes all crawled data with source attribution
   * - Limits content to avoid token limits (2000 chars per source)
   * - Includes headings and table information
   * - Instructs LLM to avoid hallucination
   * 
   * @param query - The user's question
   * @param crawlResults - Array of crawled pages
   * @returns Formatted prompt for LLM
   * 
   * Requirement: 5.1, 5.2
   */
  private buildPrompt(query: string, crawlResults: CrawlResult[]): string {
    // Construct LLM prompt with crawled content
    const crawledData = crawlResults.map((result, index) => {
      const sections = [];
      
      sections.push(`Source ${index + 1}: ${result.title}`);
      sections.push(`URL: ${result.url}`);
      
      if (result.headings && result.headings.length > 0) {
        sections.push(`Headings: ${result.headings.join(', ')}`);
      }
      
      if (result.content) {
        // Limit content to avoid token limits
        const contentPreview = result.content.substring(0, 2000);
        sections.push(`Content: ${contentPreview}`);
      }
      
      if (result.tables && result.tables.length > 0) {
        sections.push(`Tables: ${result.tables.length} table(s) found`);
        result.tables.forEach((table, tableIndex) => {
          sections.push(`  Table ${tableIndex + 1}: ${table.headers.join(' | ')}`);
        });
      }
      
      return sections.join('\n');
    }).join('\n\n---\n\n');

    return `You are an expert on Stevie Awards. Answer the following question using ONLY the provided information.

Question: ${query}

Information from stevieawards.com:
${crawledData}

Instructions:
- Provide a comprehensive, well-structured answer in natural, flowing language
- Use ONLY information from the provided sources
- Write in clear paragraphs with proper sentence structure
- DO NOT include citation markers like [1], [2] in your answer - citations will be added automatically
- If information is incomplete, explicitly state what is missing at the end
- For complex questions, organize your answer with clear sections using headings
- Be factual and precise
- Combine information from multiple sources when relevant
- Do not make assumptions or add information not present in the sources
- Write in a professional, user-friendly tone

Answer:`;
  }

  /**
   * Generate answer using LLM
   * 
   * Uses OpenAI service to generate natural language answer from crawled data.
   * Uses lower temperature (0.3) for more factual, less creative responses.
   * 
   * @param query - The user's question
   * @param crawlResults - Array of crawled pages
   * @returns Generated answer text
   * 
   * Requirement: 5.1
   */
  private async generateAnswerWithLLM(query: string, crawlResults: CrawlResult[]): Promise<string> {
    if (!this.openaiService) {
      throw new Error('OpenAI service not available');
    }

    const prompt = this.buildPrompt(query, crawlResults);
    
    return await this.openaiService.chatCompletion({
      messages: [
        { role: 'user', content: prompt }
      ],
      model: 'gpt-4o-mini',
      temperature: 0.3, // Lower temperature for more factual responses
      maxTokens: 1500,
    });
  }

  /**
   * Generate answer from raw crawled data (fallback when LLM unavailable)
   * 
   * Creates a structured answer directly from crawled data without LLM processing.
   * Extracts relevant excerpts based on query terms.
   * 
   * @param query - The user's question
   * @param crawlResults - Array of crawled pages
   * @returns Formatted answer from raw data
   * 
   * Requirement: 11.3
   */
  private generateAnswerFromRawData(query: string, crawlResults: CrawlResult[]): string {
    // Fallback to raw data when LLM service unavailable
    const sections: string[] = [];
    
    sections.push('Based on information from stevieawards.com:\n');
    
    crawlResults.forEach((result, index) => {
      sections.push(`\n**Source ${index + 1}: ${result.title}**`);
      sections.push(`URL: ${result.url}`);
      
      if (result.headings && result.headings.length > 0) {
        sections.push(`\nKey sections: ${result.headings.slice(0, 5).join(', ')}`);
      }
      
      if (result.content) {
        // Extract relevant excerpts
        const excerpts = this.extractRelevantExcerpts(query, result.content);
        if (excerpts.length > 0) {
          sections.push('\nRelevant information:');
          excerpts.forEach(excerpt => {
            sections.push(`- ${excerpt}`);
          });
        }
      }
    });
    
    sections.push('\n*Note: This answer was generated from raw data. For complete details, please refer to the source links.*');
    
    return sections.join('\n');
  }

  /**
   * Extract relevant excerpts from content based on query terms
   * 
   * Finds sentences that contain query terms and returns up to 5 relevant excerpts.
   * 
   * @param query - The user's question
   * @param content - Text content to search
   * @returns Array of relevant sentence excerpts
   */
  private extractRelevantExcerpts(query: string, content: string): string[] {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 3);
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const relevant: string[] = [];

    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      const matchCount = queryTerms.filter(term => lowerSentence.includes(term)).length;
      
      if (matchCount >= 2 || (queryTerms.length === 1 && matchCount === 1)) {
        relevant.push(sentence.trim());
        if (relevant.length >= 5) break;
      }
    }

    return relevant;
  }

  /**
   * Structure answer for complex queries
   * 
   * Adds sections and organization to answers for complex queries.
   * Detects complex queries (multiple questions, comparisons, long queries).
   * Adds missing information section if detected.
   * 
   * @param answer - The generated answer text
   * @param query - The user's question
   * @param crawlResults - Array of crawled pages
   * @returns Structured answer with sections
   * 
   * Requirement: 5.4, 5.5
   */
  private structureAnswer(answer: string, query: string, crawlResults: CrawlResult[]): string {
    // Detect if this is a complex query requiring structured answer
    const isComplexQuery = this.isComplexQuery(query);
    
    if (!isComplexQuery) {
      return answer;
    }

    // If answer already has structure (sections/headings), return as is
    if (answer.includes('\n\n') && (answer.includes('**') || answer.includes('#'))) {
      return answer;
    }

    // Add structure for complex answers
    const sections: string[] = [];
    
    // Add summary if answer is long
    if (answer.length > 500) {
      sections.push('## Summary\n');
      const firstParagraph = answer.split('\n\n')[0];
      sections.push(firstParagraph);
      sections.push('\n## Detailed Information\n');
      sections.push(answer.split('\n\n').slice(1).join('\n\n'));
    } else {
      sections.push(answer);
    }

    // Add missing information section if detected (Requirement 5.5)
    const missingInfo = this.detectMissingInfo(crawlResults);
    if (missingInfo.length > 0) {
      sections.push('\n## Missing Information\n');
      sections.push('The following information could not be found:');
      missingInfo.forEach(info => {
        sections.push(`- ${info}`);
      });
    }

    return sections.join('\n');
  }

  /**
   * Detect if query is complex and requires structured answer
   * 
   * Complex queries include:
   * - Multiple questions
   * - Comparisons
   * - Long queries (>15 words)
   * 
   * @param query - The user's question
   * @returns True if query is complex
   */
  private isComplexQuery(query: string): boolean {
    // Detect complex queries that benefit from structured answers
    const complexIndicators = [
      query.includes('?') && query.split('?').length > 2, // Multiple questions
      query.includes(' and '),
      query.includes(' or '),
      query.toLowerCase().includes('compare'),
      query.toLowerCase().includes('difference'),
      query.toLowerCase().includes('versus'),
      query.toLowerCase().includes('vs'),
      query.split(' ').length > 15, // Long query
    ];

    return complexIndicators.some(indicator => indicator);
  }

  /**
   * Detect missing information in crawled results
   * 
   * Checks for:
   * - Empty or minimal content
   * - Missing structured data (tables, headings)
   * 
   * @param crawlResults - Array of crawled pages
   * @returns Array of missing information descriptions
   * 
   * Requirement: 5.5
   */
  private detectMissingInfo(crawlResults: CrawlResult[]): string[] {
    const missing: string[] = [];

    // Check for empty or minimal content
    const hasSubstantialContent = crawlResults.some(result => 
      result.content && result.content.length > 200
    );

    if (!hasSubstantialContent) {
      missing.push('Detailed content from source pages');
    }

    // Check for missing structured data
    const hasTables = crawlResults.some(result => 
      result.tables && result.tables.length > 0
    );

    const hasHeadings = crawlResults.some(result => 
      result.headings && result.headings.length > 0
    );

    if (!hasTables && !hasHeadings) {
      missing.push('Structured information (tables, sections)');
    }

    return missing;
  }

  /**
   * Create citations from crawl results
   * 
   * @param results - Array of crawled pages
   * @returns Array of citations with URL and title
   */
  private createCitations(results: CrawlResult[]): Citation[] {
    return results.map(result => ({
      text: result.title,
      url: result.url,
      title: result.title,
    }));
  }

  /**
   * Assess confidence level based on source count and missing information
   * 
   * @param sourceCount - Number of sources used
   * @param missingInfoCount - Number of missing information items
   * @returns Confidence level (high, medium, low)
   */
  private assessConfidence(sourceCount: number, missingInfoCount: number): 'high' | 'medium' | 'low' {
    if (sourceCount >= 3 && missingInfoCount === 0) return 'high';
    if (sourceCount >= 2 && missingInfoCount <= 1) return 'medium';
    return 'low';
  }
}
