/**
 * Deterministic questionnaire flow for Stevie Awards recommendations.
 *
 * First questions are hardcoded and ordered to avoid LLM drift.
 *
 * Follow-ups are asked after the achievement description. They are required in the
 * sense that we ask them, but users may explicitly skip them (we store a skip value).
 */

export type DemographicStepId =
  | 'user_name'
  | 'user_email'
  | 'nomination_subject'
  | 'geography'
  | 'team_size'
  | 'company_size'
  | 'achievement_description'
  | 'achievement_impact'
  | 'achievement_innovation'
  | 'achievement_challenges';

export interface DemographicStep {
  id: DemographicStepId;
  question: string;
  /** Always ask these steps in order. */
  required: boolean;
}

export const DEMOGRAPHIC_STEPS: DemographicStep[] = [
  { id: 'user_name', required: true, question: "What's your name?" },
  { id: 'user_email', required: true, question: 'What’s your email address?' },
  {
    id: 'nomination_subject',
    required: true,
    question: 'Who are you nominating — yourself, a team, your organization, or a product?',
  },
  {
    id: 'geography',
    required: true,
    question: 'Where are you based / where does most of your work happen?',
  },
  {
    id: 'team_size',
    required: true,
    question: 'Roughly how many people are on the team you’re nominating?',
  },
  {
    id: 'company_size',
    required: true,
    question: 'And roughly how big is the overall company/organization (headcount)?',
  },
  {
    id: 'achievement_description',
    required: true,
    question: 'Tell me about the achievement. What are you nominating them/it for (in 2–4 sentences)?',
  },
  {
    id: 'achievement_impact',
    required: true,
    question:
      'What measurable impact or results did this achievement create? (You can share a number/percent, or say “skip”.)',
  },
  {
    id: 'achievement_innovation',
    required: true,
    question: 'What’s innovative or unique about what you did? (Or say “skip”.)',
  },
  {
    id: 'achievement_challenges',
    required: true,
    question: 'Any notable challenges you overcame (and how)? (Or say “skip”.)',
  },
];

export const STEP_TO_CONTEXT_KEY: Record<DemographicStepId, string> = {
  user_name: 'user_name',
  user_email: 'user_email',
  nomination_subject: 'nomination_subject',
  geography: 'geography',
  team_size: 'team_size',
  company_size: 'company_size',
  achievement_description: 'description',
  achievement_impact: 'achievement_impact',
  achievement_innovation: 'achievement_innovation',
  achievement_challenges: 'achievement_challenges',
};

/**
 * For "required" follow-ups we accept explicit skip tokens.
 *
 * We are forgiving about punctuation/casing, but we do NOT treat empty input as skip.
 */
export function normalizeSkippableAnswer(input: string): { skipped: boolean; value: string } {
  const raw = (input ?? '').trim();
  if (!raw) return { skipped: false, value: '' };

  // Normalize: lowercase, remove punctuation/symbols, collapse whitespace.
  // Note: this turns "don't" into "don t".
  const normalized = raw
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const skipTokens = new Set([
    'skip',
    'skipped',

    // n/a variants
    'na',
    'n a',

    // uncertainty / refusal
    'not sure',
    'unsure',
    "don't know", // if apostrophe not removed (just in case)
    'dont know',
    'don t know', // apostrophe removed
    'prefer not',
    'rather not',

    // negation
    'no',
    'none',
    'nope',
    'nah',
  ]);

  if (skipTokens.has(normalized)) return { skipped: true, value: '__skipped__' };

  return { skipped: false, value: raw };
}

export function getFirstMissingStep(context: Record<string, any>): DemographicStep | null {
  for (const step of DEMOGRAPHIC_STEPS) {
    if (!step.required) continue;
    const key = STEP_TO_CONTEXT_KEY[step.id];
    const value = context[key];
    if (value === undefined || value === null || value === '') return step;
  }
  return null;
}

export function hasRequiredDemographics(context: Record<string, any>): boolean {
  return getFirstMissingStep(context) === null;
}
