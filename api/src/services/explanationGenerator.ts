import { openaiService } from './openaiService';
import logger from '../utils/logger';

/**
 * Explanation Generator Service
 * 
 * Generates match explanations for category recommendations using OpenAI.
 * Replaces the Python AI service explanation generation.
 */

const SYSTEM_PROMPT = `You are an expert at explaining why Stevie Award categories match a nomination.

Your job is to analyze the user's nomination context and explain why each category is a good match.

For each category, provide 2-3 specific, concise reasons why it matches their nomination.

Focus on:
- Alignment with their achievement/description
- Relevance to their organization type and size
- Match with their focus areas
- Fit with the category's purpose

Keep reasons short (1 sentence each) and specific to their nomination.`;

export class ExplanationGenerator {
  /**
   * Generate match explanations for categories
   */
  async generateExplanations(params: {
    userContext: any;
    categories: Array<{
      category_id: string;
      category_name: string;
      description: string;
      program_name: string;
    }>;
  }): Promise<{
    explanations: Array<{
      category_id: string;
      match_reasons: string[];
    }>;
  }> {
    const { userContext, categories } = params;

    logger.info('generating_explanations', {
      category_count: categories.length,
    });

    try {
      const userPrompt = this.buildUserPrompt(userContext, categories);

      const response = await openaiService.chatCompletion({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        maxTokens: 2000, // Increased for more categories
      });

      const explanations = this.parseResponse(response, categories);

      logger.info('explanations_generated', {
        count: explanations.length,
      });

      return { explanations };
    } catch (error: any) {
      logger.error('explanation_generation_error', { error: error.message });
      
      // Return empty explanations on error (non-critical)
      return { explanations: [] };
    }
  }

  /**
   * Build user prompt with context and categories
   */
  private buildUserPrompt(
    userContext: any,
    categories: Array<{
      category_id: string;
      category_name: string;
      description: string;
      program_name: string;
    }>
  ): string {
    const parts: string[] = [];

    // User context
    parts.push('User Nomination Context:');
    if (userContext.nomination_subject) {
      parts.push(`- Nominating: ${userContext.nomination_subject}`);
    }
    if (userContext.description) {
      parts.push(`- Achievement: ${userContext.description.substring(0, 200)}`);
    }
    if (userContext.org_type) {
      parts.push(`- Organization Type: ${userContext.org_type}`);
    }
    if (userContext.org_size) {
      parts.push(`- Organization Size: ${userContext.org_size}`);
    }
    if (userContext.achievement_focus && userContext.achievement_focus.length > 0) {
      parts.push(`- Focus Areas: ${userContext.achievement_focus.join(', ')}`);
    }

    parts.push('');
    parts.push('Categories to Explain:');
    parts.push('');

    // Categories
    for (const category of categories) {
      parts.push(`Category ID: ${category.category_id}`);
      parts.push(`Name: ${category.category_name}`);
      parts.push(`Program: ${category.program_name}`);
      parts.push(`Description: ${category.description.substring(0, 150)}`);
      parts.push('');
    }

    parts.push('For each category, provide 2-3 specific reasons why it matches this nomination.');
    parts.push('');
    parts.push('Format your response as JSON:');
    parts.push('{');
    parts.push('  "explanations": [');
    parts.push('    {');
    parts.push('      "category_id": "cat_123",');
    parts.push('      "match_reasons": [');
    parts.push('        "Reason 1",');
    parts.push('        "Reason 2",');
    parts.push('        "Reason 3"');
    parts.push('      ]');
    parts.push('    }');
    parts.push('  ]');
    parts.push('}');

    return parts.join('\n');
  }

  /**
   * Parse OpenAI response with better error handling for truncated JSON
   */
  private parseResponse(
    raw: string,
    categories: Array<{ category_id: string }>
  ): Array<{ category_id: string; match_reasons: string[] }> {
    let text = raw.trim();

    // Strip markdown fences
    if (text.startsWith('```')) {
      const parts = text.split('```');
      text = parts[1] || text;
      if (text.toLowerCase().startsWith('json')) {
        text = text.substring(4);
      }
      text = text.trim();
    }

    try {
      const result = JSON.parse(text);

      if (result.explanations && Array.isArray(result.explanations)) {
        return result.explanations
          .filter((exp: any) => exp.category_id && Array.isArray(exp.match_reasons))
          .map((exp: any) => ({
            category_id: exp.category_id,
            match_reasons: exp.match_reasons.filter((r: any) => typeof r === 'string'),
          }));
      }

      return [];
    } catch (error: any) {
      logger.error('explanation_parse_error', {
        error: error.message,
        response: text.substring(0, 500),
        response_length: text.length,
      });

      // Try to salvage partial JSON by finding complete category objects
      try {
        const partialMatch = text.match(/"explanations"\s*:\s*\[([\s\S]*)/);
        if (partialMatch) {
          // Find all complete category objects
          const categoryPattern = /\{\s*"category_id"\s*:\s*"([^"]+)"\s*,\s*"match_reasons"\s*:\s*\[((?:[^[\]]*|\[[^\]]*\])*)\]\s*\}/g;
          const matches = [...text.matchAll(categoryPattern)];
          
          if (matches.length > 0) {
            logger.info('salvaged_partial_explanations', { count: matches.length });
            return matches.map(match => {
              const categoryId = match[1];
              const reasonsStr = match[2];
              const reasons = reasonsStr
                .split(',')
                .map(r => r.trim().replace(/^"|"$/g, ''))
                .filter(r => r.length > 0);
              return {
                category_id: categoryId,
                match_reasons: reasons,
              };
            });
          }
        }
      } catch (salvageError: any) {
        logger.warn('salvage_failed', { error: salvageError.message });
      }

      // Fallback: generate generic reasons
      logger.info('using_generic_explanations', { count: categories.length });
      return categories.map((cat) => ({
        category_id: cat.category_id,
        match_reasons: [
          'Aligns with your nomination focus',
          'Matches your organization profile',
          'Relevant to your achievement',
        ],
      }));
    }
  }
}

// Export singleton instance
export const explanationGenerator = new ExplanationGenerator();
