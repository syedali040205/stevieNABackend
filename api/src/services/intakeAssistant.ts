import { openaiService } from './openaiService';
import logger from '../utils/logger';

export type IntakeAssistantResult = {
  updates: Record<string, any>;
  next_question: string;
  ready_for_recommendations: boolean;
};

function buildPrompt(params: {
  message: string;
  userContext: any;
  conversationHistory: Array<{ role: string; content: string }>;
}): string {
  const { message, userContext, conversationHistory } = params;

  const contextSummary = Object.entries(userContext || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .slice(0, 60)
    .map(([k, v]) => `${k}: ${String(v).substring(0, 200)}`)
    .join('\n');

  const recentHistory = (conversationHistory || []).slice(-12);
  const historyText = recentHistory.map((m) => `${m.role}: ${m.content}`).join('\n');

  return `You are a Stevie Awards assistant helping a user provide details so you can recommend award categories.

This is an OPEN-ENDED conversation: you may ask questions in any order, but you must gather the required info listed below.

REQUIRED FIELDS (must be present before recommendations):
- user_name (string)
- user_email (string, valid email)
- nomination_subject (one of: individual|team|organization|product)
- geography (string)
- description (string, 20-800 chars)
- achievement_impact (string or "__skipped__")
- achievement_innovation (string or "__skipped__")
- achievement_challenges (string or "__skipped__")

OPTIONAL FIELDS (collect if naturally offered, but do not force):
- org_type (string)
- career_stage (string)
- gender_programs_opt_in (true|false|"__skipped__")
- company_age (string)
- org_size (string)
- tech_orientation (string)
- recognition_scope (one of: us_only|global|both)
- team_size (integer)
- company_size (integer)

WHAT WE ALREADY KNOW:
${contextSummary || 'Nothing yet'}

RECENT CONVERSATION:
${historyText || 'No history'}

USER'S LATEST MESSAGE:
"${message}"

YOUR TASK:
Return ONLY valid JSON with EXACTLY these keys:
{
  "updates": { ... },
  "next_question": "...",
  "ready_for_recommendations": true|false
}

RULES:
- updates: include ONLY fields you can confidently extract from the latest user message (do not guess).
- You may update multiple fields if the user provided multiple pieces of info.
- For team_size/company_size: return an INTEGER; convert number words to digits if clear.
- If the user explicitly says skip/not sure/nope/n/a for the achievement follow-ups, set that field to "__skipped__".
- next_question: must be max 2 sentences; ask exactly ONE helpful question that moves us toward missing required fields.
- Do not repeat questions for fields we already have.
- If ready_for_recommendations is true, next_question should be a short confirmation sentence (max 2 sentences) like "Perfect — I have everything I need...".
- Do not include markdown, code fences, or extra keys.`;
}

export class IntakeAssistant {
  async run(params: {
    message: string;
    userContext: any;
    conversationHistory: Array<{ role: string; content: string }>;
    signal?: AbortSignal;
  }): Promise<IntakeAssistantResult> {
    const { message, userContext, conversationHistory, signal } = params;

    const prompt = buildPrompt({ message, userContext, conversationHistory });

    const raw = await openaiService.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      maxTokens: 400,
      signal,
    });

    let text = raw.trim();
    if (text.startsWith('```')) {
      const parts = text.split('```');
      text = (parts[1] || text).trim();
      if (text.toLowerCase().startsWith('json')) text = text.substring(4).trim();
    }

    try {
      const parsed = JSON.parse(text);
      const updates = parsed?.updates && typeof parsed.updates === 'object' ? parsed.updates : {};
      const next_question = typeof parsed?.next_question === 'string' ? parsed.next_question : '';
      const ready_for_recommendations = !!parsed?.ready_for_recommendations;

      return { updates, next_question, ready_for_recommendations };
    } catch (e: any) {
      logger.warn('intake_assistant_parse_failed', { error: e.message, text: text.substring(0, 500) });
      return { updates: {}, next_question: '', ready_for_recommendations: false };
    }
  }
}

export const intakeAssistant = new IntakeAssistant();
