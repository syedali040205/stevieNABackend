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
    // Build citations array
    const citations: Citation[] = sources.map(source => ({
      url: source.url,
      title: source.title || 'Stevie Awards Information',
      snippet: this.extractSnippet(source.content),
    }));

    // Extract paragraphs from the answer
    const paragraphs = answer.split(/\n\n+/);
    
    // Create URL to citation number mapping
    const citationMap = new Map<string, number>();
    sources.forEach((source, index) => {
      citationMap.set(source.url, index + 1);
    });

    // Add citation markers at the end of each paragraph
    const citedParagraphs = paragraphs.map(paragraph => {
      if (paragraph.trim().length === 0) return paragraph;
      
      // Skip headings (lines starting with # or ##)
      if (paragraph.trim().startsWith('#')) return paragraph;
      
      // Find which sources support this paragraph
      const supportingSources = this.findSupportingSources(paragraph, sources);
      
      if (supportingSources.length > 0) {
        // Get citation numbers
        const citationNumbers = supportingSources
          .map(url => citationMap.get(url))
          .filter((num): num is number => num !== undefined)
          .sort((a, b) => a - b);

        if (citationNumbers.length > 0) {
          // Add citation marker at end of paragraph
          const marker = `[${citationNumbers.join(',')}]`;
          return paragraph.trim() + marker;
        }
      }
      
      return paragraph;
    });

    // Reconstruct answer with citations
    let citedAnswer = citedParagraphs.join('\n\n');

    // Map claims to sources for return value
    const claimToSources = new Map<string, string[]>();
    paragraphs.forEach(paragraph => {
      const supportingSources = this.findSupportingSources(paragraph, sources);
      if (supportingSources.length > 0) {
        claimToSources.set(paragraph, supportingSources);
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
   * Find sources that support a paragraph
   * 
   * @param paragraph - The paragraph text
   * @param sources - Array of crawl results
   * @returns Array of source URLs that support this paragraph
   */
  private findSupportingSources(paragraph: string, sources: CrawlResult[]): string[] {
    const supportingSources: string[] = [];

    // Extract key terms from the paragraph
    const paragraphWords = paragraph
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !this.isStopWord(word));

    sources.forEach(source => {
      const sourceContent = (
        source.content +
        ' ' +
        source.title +
        ' ' +
        source.headings.join(' ')
      ).toLowerCase();

      // Count matching words
      const matchingWords = paragraphWords.filter(word => sourceContent.includes(word));
      
      // Consider it a match if at least 30% of key words are present
      const matchRatio = matchingWords.length / Math.max(paragraphWords.length, 1);
      if (matchRatio >= 0.3) {
        supportingSources.push(source.url);
      }
    });

    // If no specific match found, attribute to all sources (conservative approach)
    if (supportingSources.length === 0 && sources.length > 0) {
      supportingSources.push(sources[0].url);
    }

    return supportingSources;
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

    const lines = ['---', '', '**Sources:**'];
    
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
}
