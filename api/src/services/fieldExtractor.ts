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
- **geography**: Where they're based / where work happens (string, e.g., "India", "USA", "UAE", "Germany", "US and Europe")
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

## Rules:

1. Only extract fields that are explicitly mentioned or strongly implied
2. Don't guess or infer beyond what's clearly stated
3. Return ONLY the fields you found - omit fields you didn't find
4. For achievement_focus, extract multiple areas if mentioned
5. Keep descriptions concise but informative
6. For user_email, validate it's a proper email format (contains @ and domain)
7. For geography, extract country name (e.g., "India", "USA", "United Kingdom", "UAE")

## Examples:

User: "My name is John Smith and my email is john@company.com"
→ {"user_name":"John Smith","user_email":"john@company.com"}

User: "I'm from India"
→ {"geography":"India"}

User: "We're based in the United States"
→ {"geography":"USA"}

User: "Pakistan" or "India" or "USA" (simple country name as answer)
→ {"geography":"<country_name>"}

User: "I want to nominate our team for winning the innovation award"
→ {"nomination_subject":"team","achievement_focus":["Innovation"]}

User: "We're a small startup that developed an AI-powered mirror"
→ {"org_type":"startup","org_size":"small","achievement_focus":["Artificial Intelligence","Product Innovation"]}

User: "I've been in this field for about 6 years"
→ {"career_stage":"few_years"}

User: "Yes, consider women in business awards too"
→ {"gender_programs_opt_in":true}

User: "No" or "no dont" or "NO" (when asked about women-in-business programs)
→ {"gender_programs_opt_in":false}

User: "We're very tech-heavy" or "Technology is central to what we do"
→ {"tech_orientation":"central"}

User: "Mainly US" or "Open to global recognition"
→ {"recognition_scope":"us_only"} or {"recognition_scope":"global"}

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

    const contextInfo = contextParts.length > 0 
      ? `\n\nContext already collected:\n${contextParts.join('\n')}\n\nDon't extract fields we already have.`
      : '';

    // Check if this is a simple "no" response to the gender_programs question
    const messageLower = message.toLowerCase().trim();
    const isSimpleNo = messageLower === 'no' || messageLower === 'no dont' || messageLower === 'nope';
    const needsGenderPrograms = userContext.gender_programs_opt_in === undefined || userContext.gender_programs_opt_in === null;
    
    let hint = '';
    if (isSimpleNo && needsGenderPrograms) {
      hint = '\n\nHINT: This looks like a "no" response to the women-in-business programs question. Extract: {"gender_programs_opt_in":false}';
    }
    
    // Check if this is a short name response (when we don't have user_name yet)
    const needsName = !userContext.user_name;
    const isShortName = message.trim().split(' ').length <= 3 && message.length < 50 && !message.includes('@');
    if (needsName && isShortName) {
      hint += `\n\nHINT: We're asking for their name and they gave a short response. This is likely their name. Extract: {"user_name":"${message.trim()}"}`;
    }

    return `User message: "${message}"${contextInfo}${hint}

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
