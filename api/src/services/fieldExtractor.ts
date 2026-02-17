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
- **geography**: Where they're based / where work happens (string, e.g., "India", "USA", "UAE", "Germany")
- **nomination_subject**: What they're nominating (values: "individual", "team", "organization", "product")
- **description**: Description of the achievement or nomination (string, 20-500 chars)
- **org_type**: Organization type (values: "for_profit", "non_profit", "government", "startup", "education")
- **org_size**: Team/organization size (values: "small", "medium", "large")
- **career_stage**: Experience level (e.g., "just_started", "few_years", "decade_plus", or free text like "5 years")
- **gender_programs_opt_in**: true if they want women-in-business programs considered, false if no/skip
- **company_age**: How long org has been around (e.g., "less_than_year", "few_years", "over_10", or free text)
- **tech_orientation**: Role of technology (e.g., "central", "supporting", "minimal", or free text)
- **recognition_scope**: "us_only", "global", or "both"
- **achievement_focus**: Array of focus areas (e.g., ["Innovation", "Technology", "Customer Service"])

## Critical Rules:

1. **Use conversation history**: Look at what the assistant just asked to understand what the user is answering
2. **Context is key**: The same word can mean different things depending on what question was asked
3. **Don't duplicate**: If we already have a field, don't extract it again unless the user is correcting it
4. Only extract fields that are explicitly mentioned or clearly implied from the conversation
5. Return ONLY the fields you found - omit fields you didn't find
6. Keep descriptions concise but informative

## Examples with conversation context:

Conversation:
assistant: "What are you nominating — yourself, a team, your organization, or a product?"
user: "team"
→ {"nomination_subject":"team"}

Conversation:
assistant: "Is this a company, a non-profit, or something else?"
user: "team"
Already have: nomination_subject="team"
→ {"org_type":"for_profit"}
(User is confused, they meant "company" but said "team" because that's what they're nominating)

Conversation:
assistant: "What's your name?"
user: "John Smith"
→ {"user_name":"John Smith"}

Conversation:
assistant: "Could you share your email?"
user: "john@company.com"
→ {"user_email":"john@company.com"}

Conversation:
assistant: "Some programs are for women leaders. Want me to consider those?"
user: "no"
→ {"gender_programs_opt_in":false}

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
    conversationHistory?: Array<{ role: string; content: string }>;
    signal?: AbortSignal;
  }): Promise<Record<string, any>> {
    const { message, userContext, conversationHistory = [], signal } = params;

    logger.info('extracting_fields', {
      message_length: message.length,
    });

    try {
      const userPrompt = this.buildUserPrompt(message, userContext, conversationHistory);

      const response = await openaiService.chatCompletion({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.0,
        maxTokens: 300,
        signal,
      });

      const extracted = this.parseResponse(response);

      logger.info('fields_extracted', {
        fields: Object.keys(extracted),
        field_count: Object.keys(extracted).length,
      });

      return extracted;
    } catch (error: any) {
      if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') throw error;
      logger.error('field_extraction_error', { error: error.message });
      return {};
    }
  }

  /**
   * Build user prompt
   */
  private buildUserPrompt(
    message: string,
    userContext: any,
    conversationHistory: Array<{ role: string; content: string }>
  ): string {
    const contextParts: string[] = [];

    if (userContext.user_name) {
      contextParts.push(`Already know user_name: ${userContext.user_name}`);
    }
    if (userContext.user_email) {
      contextParts.push(`Already know user_email: ${userContext.user_email}`);
    }
    if (userContext.geography) {
      contextParts.push(`Already know geography: ${userContext.geography}`);
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
    if (userContext.career_stage) {
      contextParts.push(`Already know career_stage: ${userContext.career_stage}`);
    }
    if (userContext.gender_programs_opt_in !== undefined) {
      contextParts.push(`Already know gender_programs_opt_in: ${userContext.gender_programs_opt_in}`);
    }
    if (userContext.company_age) {
      contextParts.push(`Already know company_age: ${userContext.company_age}`);
    }
    if (userContext.tech_orientation) {
      contextParts.push(`Already know tech_orientation: ${userContext.tech_orientation}`);
    }
    if (userContext.recognition_scope) {
      contextParts.push(`Already know recognition_scope: ${userContext.recognition_scope}`);
    }
    if (userContext.description) {
      contextParts.push(`Already have description: ${userContext.description.substring(0, 100)}`);
    }

    const contextInfo =
      contextParts.length > 0
        ? `\n\nFields already collected:\n${contextParts.join('\n')}`
        : '';

    // Include recent conversation history for context
    const recentHistory = conversationHistory.slice(-6); // Last 3 turns
    const historyText =
      recentHistory.length > 0
        ? '\n\nRecent conversation:\n' +
          recentHistory.map((msg) => `${msg.role}: ${msg.content}`).join('\n')
        : '';

    return `User's current message: "${message}"${contextInfo}${historyText}

Extract any new fields from the user's message. Use the conversation history to understand what question they're answering.

Don't extract fields we already have. Focus on what's new in this message.`;
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

      // geography
      if (result.geography && typeof result.geography === 'string') {
        const geo = result.geography.trim();
        if (geo.length >= 2 && geo.length <= 100) {
          cleaned.geography = geo;
        }
      }

      // nomination_subject
      if (result.nomination_subject) {
        const valid = ['individual', 'team', 'organization', 'product'];
        if (valid.includes(String(result.nomination_subject).toLowerCase())) {
          cleaned.nomination_subject = String(result.nomination_subject).toLowerCase();
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
        const normalized = String(result.org_type).toLowerCase().replace(/[^a-z_]/g, '_');
        if (valid.includes(normalized)) {
          cleaned.org_type = normalized;
        }
      }

      // org_size
      if (result.org_size) {
        const valid = ['small', 'medium', 'large'];
        if (valid.includes(String(result.org_size).toLowerCase())) {
          cleaned.org_size = String(result.org_size).toLowerCase();
        }
      }

      // achievement_focus
      if (Array.isArray(result.achievement_focus) && result.achievement_focus.length > 0) {
        cleaned.achievement_focus = result.achievement_focus
          .filter((f: any) => typeof f === 'string' && f.trim().length > 0)
          .map((f: string) => f.trim());
      }

      // career_stage
      if (result.career_stage && typeof result.career_stage === 'string') {
        const s = result.career_stage.trim().toLowerCase();
        if (['just_started', 'few_years', 'decade_plus'].includes(s)) {
          cleaned.career_stage = s;
        } else if (result.career_stage.length >= 2 && result.career_stage.length <= 80) {
          cleaned.career_stage = result.career_stage.trim();
        }
      }

      // gender_programs_opt_in
      if (typeof result.gender_programs_opt_in === 'boolean') {
        cleaned.gender_programs_opt_in = result.gender_programs_opt_in;
      }
      if (typeof result.gender_programs_opt_in === 'string') {
        const v = result.gender_programs_opt_in.toLowerCase();
        if (v === 'true' || v === 'yes' || v === '1') cleaned.gender_programs_opt_in = true;
        if (v === 'false' || v === 'no' || v === '0') cleaned.gender_programs_opt_in = false;
      }

      // company_age
      if (result.company_age && typeof result.company_age === 'string') {
        const a = result.company_age.trim();
        if (a.length >= 2 && a.length <= 80) cleaned.company_age = a;
      }

      // tech_orientation
      if (result.tech_orientation && typeof result.tech_orientation === 'string') {
        const t = result.tech_orientation.trim();
        if (t.length >= 2 && t.length <= 80) cleaned.tech_orientation = t;
      }

      // recognition_scope
      if (result.recognition_scope && typeof result.recognition_scope === 'string') {
        const r = result.recognition_scope.trim().toLowerCase();
        if (['us_only', 'global', 'both'].includes(r)) cleaned.recognition_scope = r;
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
