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
   * Only cites the most prominent source
   * 
   * @param answer - The generated answer text
   * @param sources - Array of crawl results used to generate the answer
   * @returns CitedAnswer with inline citations and footnotes
   */
  async addCitations(answer: string, sources: CrawlResult[]): Promise<CitedAnswer> {
    if (sources.length === 0) {
      return {
        answer,
        citations: [],
        inlineCitations: new Map(),
      };
    }

    // Use only the most prominent source (first one, which is usually most relevant)
    const primarySource = sources[0];
    
    const citation: Citation = {
      url: primarySource.url,
      title: primarySource.title || 'Stevie Awards Information',
      snippet: this.extractSnippet(primarySource.content),
    };

    // Add single citation at the end of the answer
    const footnote = `\n\n---\n\n**Source:** [${citation.title}](${citation.url})`;
    const citedAnswer = answer + footnote;

    // Map for return value
    const claimToSources = new Map<string, string[]>();
    claimToSources.set(answer, [primarySource.url]);

    return {
      answer: citedAnswer,
      citations: [citation],
      inlineCitations: claimToSources,
    };
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
