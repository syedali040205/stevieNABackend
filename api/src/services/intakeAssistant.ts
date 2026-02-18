import { openaiService } from './openaiService';
import logger from '../utils/logger';
import type { IntakeField } from './intakeFlow';

export type IntakeAssistantPlanResult = {
  updates: Record<string, any>;
  next_field: IntakeField | null;
  next_question: string;
  ready_for_recommendations: boolean;
};

const INTAKE_FIELDS: IntakeField[] = [
  'user_name',
  'user_email',
  'nomination_subject',
  'org_type',
  'gender_programs_opt_in',
  'recognition_scope',
  'geography',
  'description',
  'achievement_impact',
  'achievement_innovation',
  'achievement_challenges',
];

function buildPrompt(params: { userContext: any; message: string }): string {
  const { userContext, message } = params;

  const contextSummary = Object.entries(userContext || {})
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    .slice(0, 80)
    .map(([k, v]) => `${k}: ${String(v).substring(0, 300)}`)
    .join('\n');

  return `You are a friendly Stevie Awards assistant having a natural conversation. Talk like a helpful colleague, not a form.

Look at what you already know and what the user just said. Extract any info and ask the next question naturally.

REQUIRED info (collect these before recommendations):
- user_name
- user_email
- nomination_subject (individual|team|organization|product)
- org_type (for_profit|non_profit)
- gender_programs_opt_in (true|false|"__skipped__")
- recognition_scope (us_only|global|both)
- description

OPTIONAL follow-ups (ask 1-2 ONLY after description to enrich):
- achievement_impact
- achievement_innovation
- achievement_challenges

Allowed field names:
${INTAKE_FIELDS.join(', ')}

HOW TO ASK NATURALLY (vary your phrasing, reference context):
- user_name: "What's your name?" / "And you are?" / "Who should I put down for this?"
- user_email: "What's your email?" / "And your email address?" / "Email?"
- nomination_subject: "Got it! Are we nominating an individual, a team, an organization, or a product?" / "Is this for a person, team, company, or product?"
- org_type: "Is this a for-profit or non-profit?" / "For-profit company or non-profit organization?" / "Profit or non-profit?"
- gender_programs_opt_in: "Interested in women-focused awards too?" / "Would you like to be considered for women's leadership categories? (yes/no/skip)" / "Want to include women-specific awards?"
- recognition_scope: "Are you looking at US awards, international, or both?" / "US-only or global awards?" / "Interested in just US awards or worldwide?"
- description: "Tell me about the achievement!" / "What makes this special?" / "What did they accomplish?" / "What's the story here?"
- achievement_impact: "What kind of impact did this have?" / "Any measurable results?" / "How did this affect people or the business?"
- achievement_innovation: "What made this innovative?" / "What was unique about this approach?" / "What set this apart?"
- achievement_challenges: "What obstacles did they overcome?" / "Any challenges along the way?" / "What made this difficult?"

CONTEXT-AWARE EXAMPLES:
- If they mention "team" → "Great! What's your name?"
- If they give name → "Thanks [name]! What's your email?"
- If they describe achievement → "That sounds impressive! What kind of impact did it have?"
- After 1 follow-up → "Perfect! Let me find the best categories for you."

Email validation rule:
- If user_email exists but invalid (no @ or no . after @), set next_field="user_email" and next_question EXACTLY:
this email structure is not valid please type correct email ok

Current context:
${contextSummary || 'Just starting'}

User just said:
"${message}"

Return ONLY valid JSON:
{
  "updates": {"field": "value"},
  "next_field": "user_name" | "user_email" | "nomination_subject" | "org_type" | "gender_programs_opt_in" | "recognition_scope" | "geography" | "description" | "achievement_impact" | "achievement_innovation" | "achievement_challenges" | null,
  "next_question": "...",
  "ready_for_recommendations": true|false
}

Rules:
- Sound human - vary phrasing, acknowledge what they said, use their name if you have it
- Extract fields from their message into updates
- Ask ONE question (1-2 sentences)
- Don't ask for fields already collected
- After description, ask 1-2 optional follow-ups max (not all 3)
- When ready: "Perfect! Let me find the best categories for you." or similar
- No markdown`;
}


export class IntakeAssistant {
  async planNext(params: { userContext: any; message: string; signal?: AbortSignal }): Promise<IntakeAssistantPlanResult> {
    const { userContext, message, signal } = params;

    const prompt = buildPrompt({ userContext, message });

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
      const next_question = typeof parsed?.next_question === 'string' ? parsed.next_question.trim() : '';
      const ready_for_recommendations = !!parsed?.ready_for_recommendations;
      const next_field = parsed?.next_field ?? null;
      const updatesRaw = parsed?.updates && typeof parsed.updates === 'object' ? parsed.updates : {};

      // Filter updates to allowed keys only.
      const updates: Record<string, any> = {};
      for (const k of Object.keys(updatesRaw)) {
        if (INTAKE_FIELDS.includes(k as IntakeField)) updates[k] = updatesRaw[k];
      }

      const normalizedNextField: IntakeField | null = INTAKE_FIELDS.includes(next_field) ? (next_field as IntakeField) : null;

      return {
        updates,
        next_field: normalizedNextField,
        next_question: next_question || 'Okay — what should I ask next?',
        ready_for_recommendations,
      };
    } catch (e: any) {
      logger.warn('intake_assistant_plan_parse_failed', { error: e.message, text: text.substring(0, 400) });
      return {
        updates: {},
        next_field: 'user_name',
        next_question: "What's your name for the nomination?",
        ready_for_recommendations: false,
      };
    }
  }
}

export const intakeAssistant = new IntakeAssistant();
