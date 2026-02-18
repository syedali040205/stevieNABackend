import { openaiService } from './openaiService';
import logger from '../utils/logger';

/**
 * Field Extractor Service
 *
 * Extracts structured fields from user messages using OpenAI.
 */

const SYSTEM_PROMPT = `You are a field extraction assistant for a Stevie Awards nomination chatbot.

Extract any NEW fields from the user's message based on the conversation.
Return ONLY valid JSON. Omit fields you didn't find. If none found, return {}.

Fields:
- user_name: string
- user_email: string (valid)
- nomination_subject: one of individual|team|organization|product
- org_type: one of for_profit|non_profit
- gender_programs_opt_in: boolean or "__skipped__"
- recognition_scope: one of us_only|global|both
- geography: string
- career_stage: string
- company_age: string
- org_size: string
- tech_orientation: string
- team_size: number
- company_size: number
- description: string (20-800 chars)
- achievement_impact: string (or "__skipped__")
- achievement_innovation: string (or "__skipped__")
- achievement_challenges: string (or "__skipped__")`;

export class FieldExtractor {
  async extractFields(params: {
    message: string;
    userContext: any;
    conversationHistory?: Array<{ role: string; content: string }>;
    signal?: AbortSignal;
  }): Promise<Record<string, any>> {
    const { message, userContext, conversationHistory = [], signal } = params;

    logger.info('extracting_fields', { message_length: message.length });

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

  private buildUserPrompt(
    message: string,
    userContext: any,
    conversationHistory: Array<{ role: string; content: string }>
  ): string {
    const contextParts: string[] = [];

    const keys = [
      'user_name',
      'user_email',
      'nomination_subject',
      'org_type',
      'gender_programs_opt_in',
      'recognition_scope',
      'geography',
      'career_stage',
      'company_age',
      'org_size',
      'tech_orientation',
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
        if (geo.length >= 2 && geo.length <= 160) cleaned.geography = geo;
      }

      for (const k of ['career_stage', 'company_age', 'org_size', 'tech_orientation']) {
        if (typeof result[k] === 'string') {
          const v = result[k].trim();
          if (v.length >= 2 && v.length <= 160) cleaned[k] = v;
        }
      }

      if (typeof result.org_type === 'string') {
        const orgType = result.org_type.trim().toLowerCase();
        if (['for_profit', 'non_profit'].includes(orgType)) cleaned.org_type = orgType;
      }

      if (typeof result.gender_programs_opt_in === 'boolean') {
        cleaned.gender_programs_opt_in = result.gender_programs_opt_in;
      }
      if (typeof result.gender_programs_opt_in === 'string') {
        const v = result.gender_programs_opt_in.trim();
        if (v === '__skipped__') cleaned.gender_programs_opt_in = '__skipped__';
      }

      if (typeof result.recognition_scope === 'string') {
        const r = result.recognition_scope.trim().toLowerCase();
        if (['us_only', 'global', 'both'].includes(r)) cleaned.recognition_scope = r;
      }

      if (result.nomination_subject) {
        const valid = ['individual', 'team', 'organization', 'product'];
        const v = String(result.nomination_subject).toLowerCase();
        if (valid.includes(v)) cleaned.nomination_subject = v;
      }

      const toNumber = (v: any): number | null => {
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'string') {
          const m = v.match(/(\d{1,9})/);
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

      if (typeof result.description === 'string') {
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
