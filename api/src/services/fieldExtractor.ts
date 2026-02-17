import { openaiService } from './openaiService';
import logger from '../utils/logger';
import type { DemographicStepId } from './demographicQuestions';

/**
 * Field Extractor Service
 *
 * Extracts structured fields from user messages using OpenAI.
 *
 * Supports a strict mode (`onlyField`) used by the deterministic recommendation intake.
 */

const BASE_FIELDS = `Fields:
- user_name: string
- user_email: string (valid)
- geography: string
- nomination_subject: one of individual|team|organization|product
- team_size: number
- company_size: number
- description: string (20-800 chars)
- achievement_impact: string (may be "__skipped__")
- achievement_innovation: string (may be "__skipped__")
- achievement_challenges: string (may be "__skipped__")`;

function buildSystemPrompt(onlyField?: DemographicStepId): string {
  if (!onlyField) {
    return `You are a field extraction assistant for a Stevie Awards nomination chatbot.

Extract any NEW fields from the user's message based on the conversation.
Return ONLY valid JSON. Omit fields you didn't find. If none found, return {}.

${BASE_FIELDS}`;
  }

  return `You are a STRICT field extraction assistant for a Stevie Awards nomination chatbot.

You MUST extract ONLY ONE field: "${onlyField}".

Rules:
- Return ONLY valid JSON.
- If the user message does not contain a confident answer for "${onlyField}", return {}.
- Do NOT extract any other fields.
- Do NOT guess.

Field types:
- user_name: string
- user_email: string
- nomination_subject: one of individual|team|organization|product
- geography: string
- team_size: number
- company_size: number
- achievement_description: string (map to key "description")
- achievement_impact: string
- achievement_innovation: string
- achievement_challenges: string

NOTE: When onlyField is "achievement_description", use JSON key "description".
When onlyField is one of the follow-ups, use that exact key.
`;
}

export class FieldExtractor {
  async extractFields(params: {
    message: string;
    userContext: any;
    conversationHistory?: Array<{ role: string; content: string }>;
    signal?: AbortSignal;
    onlyField?: DemographicStepId;
  }): Promise<Record<string, any>> {
    const { message, userContext, conversationHistory = [], signal, onlyField } = params;

    logger.info('extracting_fields', { message_length: message.length, only_field: onlyField ?? null });

    try {
      const userPrompt = this.buildUserPrompt(message, userContext, conversationHistory, onlyField);

      const response = await openaiService.chatCompletion({
        messages: [
          { role: 'system', content: buildSystemPrompt(onlyField) },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.0,
        maxTokens: 250,
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

  private buildUserPrompt(
    message: string,
    userContext: any,
    conversationHistory: Array<{ role: string; content: string }>,
    onlyField?: DemographicStepId
  ): string {
    const contextParts: string[] = [];

    const keys = [
      'user_name',
      'user_email',
      'geography',
      'nomination_subject',
      'team_size',
      'company_size',
      'description',
      'achievement_impact',
      'achievement_innovation',
      'achievement_challenges',
    ];

    for (const k of keys) {
      if (userContext[k] !== undefined && userContext[k] !== null && userContext[k] !== '') {
        contextParts.push(`Already know ${k}: ${String(userContext[k]).substring(0, 140)}`);
      }
    }

    const contextInfo = contextParts.length > 0 ? `\n\nAlready collected:\n${contextParts.join('\n')}` : '';

    const recentHistory = conversationHistory.slice(-8);
    const historyText =
      recentHistory.length > 0
        ? '\n\nRecent conversation:\n' + recentHistory.map((msg) => `${msg.role}: ${msg.content}`).join('\n')
        : '';

    if (onlyField) {
      return `We are collecting "${onlyField}".

User message: "${message}"${contextInfo}${historyText}

Return JSON for ONLY that field if present, else {}.`;
    }

    return `User message: "${message}"${contextInfo}${historyText}\n\nExtract any NEW fields from the user message. Pay attention to what the assistant asked most recently.`;
  }

  private parseResponse(raw: string): Record<string, any> {
    let text = raw.trim();

    if (text.startsWith('```')) {
      const parts = text.split('```');
      text = parts[1] || text;
      if (text.toLowerCase().startsWith('json')) text = text.substring(4);
      text = text.trim();
    }

    try {
      const result = JSON.parse(text);
      const cleaned: Record<string, any> = {};

      if (result.user_name && typeof result.user_name === 'string') {
        const name = result.user_name.trim();
        if (name.length >= 2 && name.length <= 100) cleaned.user_name = name;
      }

      if (result.user_email && typeof result.user_email === 'string') {
        const email = result.user_email.trim().toLowerCase();
        if (email.includes('@') && email.includes('.') && email.length >= 5) cleaned.user_email = email;
      }

      if (result.geography && typeof result.geography === 'string') {
        const geo = result.geography.trim();
        if (geo.length >= 2 && geo.length <= 100) cleaned.geography = geo;
      }

      if (result.nomination_subject) {
        const valid = ['individual', 'team', 'organization', 'product'];
        const v = String(result.nomination_subject).toLowerCase();
        if (valid.includes(v)) cleaned.nomination_subject = v;
      }

      const toNumber = (v: any): number | null => {
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'string') {
          const m = v.match(/(\d{1,6})/);
          if (m) {
            const n = parseInt(m[1], 10);
            return Number.isFinite(n) ? n : null;
          }
        }
        return null;
      };

      const teamN = toNumber(result.team_size);
      if (teamN !== null) cleaned.team_size = teamN;

      const companyN = toNumber(result.company_size);
      if (companyN !== null) cleaned.company_size = companyN;

      if (result.description && typeof result.description === 'string') {
        const desc = result.description.trim();
        if (desc.length >= 20 && desc.length <= 800) cleaned.description = desc;
      }

      for (const k of ['achievement_impact', 'achievement_innovation', 'achievement_challenges']) {
        if (typeof result[k] === 'string') {
          const v = result[k].trim();
          if (v.length > 0 && v.length <= 800) cleaned[k] = v;
        }
      }

      return cleaned;
    } catch (error: any) {
      logger.error('field_extraction_parse_error', { error: error.message, response: text.substring(0, 300) });
      return {};
    }
  }
}

export const fieldExtractor = new FieldExtractor();
