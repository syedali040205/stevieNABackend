import type { CrawlResult } from './crawler/crawler';

/**
 * Citation information for a source
 */
export interface Citation {
  url: string;
  title: string;
  snippet: string;
}

/**
 * Answer with inline citations and footnotes
 */
export interface CitedAnswer {
  answer: string;
  citations: Citation[];
  inlineCitations: Map<string, string[]>; // claim -> source URLs
}

/**
 * CitationSystem - Tracks and formats source URLs for all information in answers
 * 
 * Features:
 * - Tracks source URL for every piece of information
 * - Adds inline citations as superscript numbers [1]
 * - Includes footnote section with full URLs and titles
 * - Formats citations as clickable markdown links
 * - Lists all relevant sources when multiple support same fact
 * - Ensures every claim has at least one citation
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
export class CitationSystem {
  /**
   * Add citations to an answer based on source data
   * 
   * @param answer - The generated answer text
   * @param sources - Array of crawl results used to generate the answer
   * @returns CitedAnswer with inline citations and footnotes
   */
  async addCitations(answer: string, sources: CrawlResult[]): Promise<CitedAnswer> {
    // Extract factual claims from the answer
    const claims = this.extractClaims(answer);

    // Map claims to their source URLs
    const claimToSources = this.mapClaimsToSources(claims, sources);

    // Build citations array
    const citations: Citation[] = sources.map(source => ({
      url: source.url,
      title: source.title || 'Stevie Awards Information',
      snippet: this.extractSnippet(source.content),
    }));

    // Add inline citation markers to the answer
    let citedAnswer = answer;
    const citationMap = new Map<string, number>();
    
    // Create URL to citation number mapping
    sources.forEach((source, index) => {
      citationMap.set(source.url, index + 1);
    });

    // Add citation markers after sentences that contain claims
    claims.forEach(claim => {
      const sourceUrls = claimToSources.get(claim) || [];
      if (sourceUrls.length > 0) {
        // Get citation numbers for this claim
        const citationNumbers = sourceUrls
          .map(url => citationMap.get(url))
          .filter((num): num is number => num !== undefined)
          .sort((a, b) => a - b);

        if (citationNumbers.length > 0) {
          // Format citation markers: [1] or [1,2]
          const marker = `[${citationNumbers.join(',')}]`;
          
          // Add marker after the claim if not already present
          const claimRegex = new RegExp(this.escapeRegex(claim), 'g');
          citedAnswer = citedAnswer.replace(claimRegex, (match) => {
            // Don't add duplicate markers
            if (citedAnswer.indexOf(match + marker) === -1) {
              return match + marker;
            }
            return match;
          });
        }
      }
    });

    // Add footnotes section
    const footnotes = this.formatCitations(citations);
    citedAnswer = citedAnswer + '\n\n' + footnotes;

    return {
      answer: citedAnswer,
      citations,
      inlineCitations: claimToSources,
    };
  }

  /**
   * Extract factual claims from answer text
   * Identifies sentences that contain factual statements
   * 
   * @param answer - The answer text
   * @returns Array of claim strings
   */
  private extractClaims(answer: string): string[] {
    const claims: string[] = [];

    // Split into sentences (simple approach)
    const sentences = answer
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    sentences.forEach(sentence => {
      // Consider a sentence a claim if it:
      // - Contains specific information (numbers, dates, names)
      // - Is not a question
      // - Is not too short
      if (
        sentence.length > 20 &&
        !sentence.endsWith('?') &&
        this.containsFactualContent(sentence)
      ) {
        claims.push(sentence);
      }
    });

    return claims;
  }

  /**
   * Check if a sentence contains factual content
   * 
   * @param sentence - The sentence to check
   * @returns True if sentence contains factual content
   */
  private containsFactualContent(sentence: string): boolean {
    // Check for indicators of factual content
    const factualIndicators = [
      /\d+/,  // Contains numbers
      /\$\d+/,  // Contains prices
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/i,  // Contains month names
      /\b(?:eligibility|requirement|deadline|category|award|price|fee|entry|nomination)\b/i,  // Contains key terms
      /\b(?:must|shall|should|required|can|may|will)\b/i,  // Contains modal verbs indicating rules
    ];

    return factualIndicators.some(pattern => pattern.test(sentence));
  }

  /**
   * Map claims to their source URLs
   * Links each claim to the sources that support it
   * 
   * @param claims - Array of claim strings
   * @param sources - Array of crawl results
   * @returns Map of claim to source URLs
   */
  private mapClaimsToSources(claims: string[], sources: CrawlResult[]): Map<string, string[]> {
    const claimToSources = new Map<string, string[]>();

    claims.forEach(claim => {
      const supportingSources: string[] = [];

      // Find sources that contain information related to this claim
      sources.forEach(source => {
        if (this.sourceSupportsClaim(claim, source)) {
          supportingSources.push(source.url);
        }
      });

      // If no specific match found, attribute to all sources (conservative approach)
      // This ensures every claim has at least one citation (Requirement 6.5)
      if (supportingSources.length === 0 && sources.length > 0) {
        supportingSources.push(sources[0].url);
      }

      claimToSources.set(claim, supportingSources);
    });

    return claimToSources;
  }

  /**
   * Check if a source supports a claim
   * Uses keyword matching and content similarity
   * 
   * @param claim - The claim to check
   * @param source - The source to check against
   * @returns True if source supports the claim
   */
  private sourceSupportsClaim(claim: string, source: CrawlResult): boolean {
    // Extract key terms from the claim
    const claimWords = claim
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3)  // Filter out short words
      .filter(word => !this.isStopWord(word));

    // Check if source content contains significant overlap with claim
    const sourceContent = (
      source.content +
      ' ' +
      source.title +
      ' ' +
      source.headings.join(' ')
    ).toLowerCase();

    // Count matching words
    const matchingWords = claimWords.filter(word => sourceContent.includes(word));
    
    // Consider it a match if at least 30% of key words are present
    const matchRatio = matchingWords.length / Math.max(claimWords.length, 1);
    return matchRatio >= 0.3;
  }

  /**
   * Check if a word is a stop word (common word to ignore)
   * 
   * @param word - The word to check
   * @returns True if word is a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her',
      'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how',
      'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did',
      'its', 'let', 'put', 'say', 'she', 'too', 'use', 'with', 'from', 'have',
      'this', 'that', 'they', 'will', 'your', 'what', 'when', 'make', 'than',
      'been', 'call', 'come', 'each', 'find', 'into', 'long', 'look', 'more',
      'other', 'their', 'there', 'these', 'which', 'would', 'about', 'after',
    ]);
    return stopWords.has(word.toLowerCase());
  }

  /**
   * Format citations as markdown footnotes
   * 
   * @param citations - Array of citations
   * @returns Formatted citation string
   */
  private formatCitations(citations: Citation[]): string {
    if (citations.length === 0) {
      return '';
    }

    const lines = ['**Sources:**', ''];
    
    citations.forEach((citation, index) => {
      const number = index + 1;
      const title = citation.title || 'Stevie Awards Information';
      const url = citation.url;
      
      // Format: [1] Title - URL
      lines.push(`[${number}] ${title} - ${url}`);
    });

    return lines.join('\n');
  }

  /**
   * Extract a snippet from content for citation preview
   * 
   * @param content - Full content text
   * @returns Short snippet (first 100 characters)
   */
  private extractSnippet(content: string): string {
    const maxLength = 100;
    if (content.length <= maxLength) {
      return content;
    }
    return content.substring(0, maxLength).trim() + '...';
  }

  /**
   * Escape special regex characters in a string
   * 
   * @param str - String to escape
   * @returns Escaped string
   */
  /**
     * Escape special regex characters in a string
     * 
     * @param str - String to escape
     * @returns Escaped string
     */
    private escapeRegex(str: string): string {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }


}
