import { openaiService } from './openaiService';
import logger from '../utils/logger';

/**
 * Field Extractor Service
 * 
 * Extracts structured fields from user messages using OpenAI.
 * Identifies nomination details like subject, description, org info, etc.
 */

const SYSTEM_PROMPT = `You are a field extraction assistant for a Stevie Awards nomination chatbot.

Your job is to extract structured information from the user's message and return it as JSON.

## Fields to extract:

- **user_name**: User's full name (string)
- **user_email**: User's email address (string, must be valid email format)
- **nomination_subject**: What they're nominating (values: "individual", "team", "organization", "product")
- **description**: Description of the achievement or nomination (string, 20-500 chars)
- **org_type**: Organization type (values: "for_profit", "non_profit", "government", "startup")
- **org_size**: Organization size (values: "small", "medium", "large")
- **achievement_focus**: Array of focus areas (e.g., ["Innovation", "Technology", "Customer Service"])

## Rules:

1. Only extract fields that are explicitly mentioned or strongly implied
2. Don't guess or infer beyond what's clearly stated
3. Return ONLY the fields you found - omit fields you didn't find
4. For achievement_focus, extract multiple areas if mentioned
5. Keep descriptions concise but informative
6. For user_email, validate it's a proper email format (contains @ and domain)

## Examples:

User: "My name is John Smith and my email is john@company.com"
→ {"user_name":"John Smith","user_email":"john@company.com"}

User: "I want to nominate our team for winning the innovation award"
→ {"nomination_subject":"team","achievement_focus":["Innovation"]}

User: "We're a small startup that developed an AI-powered mirror"
→ {"org_type":"startup","org_size":"small","achievement_focus":["Artificial Intelligence","Product Innovation"]}

User: "Our product won top 5 in the ideathon competition"
→ {"nomination_subject":"product","achievement_focus":["Competition Success","Recognition"],"description":"Won top 5 in ideathon competition"}

## Output format:

Return ONLY valid JSON with the extracted fields. No markdown, no explanation:
{"field_name":"value",...}

If no fields found, return empty object: {}`;

export class FieldExtractor {
  /**
   * Extract fields from user message
   */
  async extractFields(params: {
    message: string;
    userContext: any;
  }): Promise<Record<string, any>> {
    const { message, userContext } = params;

    logger.info('extracting_fields', {
      message_length: message.length,
    });

    try {
      const userPrompt = this.buildUserPrompt(message, userContext);

      const response = await openaiService.chatCompletion({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.0,
        maxTokens: 300,
      });

      const extracted = this.parseResponse(response);

      logger.info('fields_extracted', {
        fields: Object.keys(extracted),
        field_count: Object.keys(extracted).length,
      });

      return extracted;
    } catch (error: any) {
      logger.error('field_extraction_error', { error: error.message });
      return {};
    }
  }

  /**
   * Build user prompt
   */
  private buildUserPrompt(message: string, userContext: any): string {
    const contextParts: string[] = [];

    if (userContext.user_name) {
      contextParts.push(`Already know user_name: ${userContext.user_name}`);
    }
    if (userContext.user_email) {
      contextParts.push(`Already know user_email: ${userContext.user_email}`);
    }
    if (userContext.nomination_subject) {
      contextParts.push(`Already know nomination_subject: ${userContext.nomination_subject}`);
    }
    if (userContext.org_type) {
      contextParts.push(`Already know org_type: ${userContext.org_type}`);
    }
    if (userContext.org_size) {
      contextParts.push(`Already know org_size: ${userContext.org_size}`);
    }
    if (userContext.description) {
      contextParts.push(`Already have description: ${userContext.description.substring(0, 100)}`);
    }

    const contextInfo = contextParts.length > 0 
      ? `\n\nContext already collected:\n${contextParts.join('\n')}\n\nDon't extract fields we already have.`
      : '';

    return `User message: "${message}"${contextInfo}

Extract any new fields from this message.`;
  }

  /**
   * Parse OpenAI response
   */
  private parseResponse(raw: string): Record<string, any> {
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

      // Validate and clean extracted fields
      const cleaned: Record<string, any> = {};

      // user_name
      if (result.user_name && typeof result.user_name === 'string') {
        const name = result.user_name.trim();
        if (name.length >= 2 && name.length <= 100) {
          cleaned.user_name = name;
        }
      }

      // user_email
      if (result.user_email && typeof result.user_email === 'string') {
        const email = result.user_email.trim().toLowerCase();
        // Basic email validation
        if (email.includes('@') && email.includes('.') && email.length >= 5) {
          cleaned.user_email = email;
        }
      }

      // nomination_subject
      if (result.nomination_subject) {
        const valid = ['individual', 'team', 'organization', 'product'];
        if (valid.includes(result.nomination_subject.toLowerCase())) {
          cleaned.nomination_subject = result.nomination_subject.toLowerCase();
        }
      }

      // description
      if (result.description && typeof result.description === 'string') {
        const desc = result.description.trim();
        if (desc.length >= 20 && desc.length <= 500) {
          cleaned.description = desc;
        }
      }

      // org_type
      if (result.org_type) {
        const valid = ['for_profit', 'non_profit', 'government', 'startup'];
        const normalized = result.org_type.toLowerCase().replace(/[^a-z_]/g, '_');
        if (valid.includes(normalized)) {
          cleaned.org_type = normalized;
        }
      }

      // org_size
      if (result.org_size) {
        const valid = ['small', 'medium', 'large'];
        if (valid.includes(result.org_size.toLowerCase())) {
          cleaned.org_size = result.org_size.toLowerCase();
        }
      }

      // achievement_focus
      if (Array.isArray(result.achievement_focus) && result.achievement_focus.length > 0) {
        cleaned.achievement_focus = result.achievement_focus
          .filter((f: any) => typeof f === 'string' && f.trim().length > 0)
          .map((f: string) => f.trim());
      }

      return cleaned;
    } catch (error: any) {
      logger.error('field_extraction_parse_error', {
        error: error.message,
        response: text.substring(0, 300),
      });
      return {};
    }
  }
}

// Export singleton instance
export const fieldExtractor = new FieldExtractor();
