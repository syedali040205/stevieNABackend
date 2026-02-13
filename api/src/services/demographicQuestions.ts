/**
 * Conversational demographic layer for Stevie Awards chatbot.
 * Defines the order and umbrella-style phrasings so the AI asks naturally
 * and we can route to the right programs (American, International, Women in Business,
 * Technology Excellence, Sales & Customer Service, etc.).
 *
 * Goal: collect basic demographics upfront without turning the flow into a form.
 * Ask ONE question at a time, in this order. All except gender_programs are required
 * before offering category recommendations (gender_programs is opt-in and optional).
 */

export type DemographicStepId =
  | 'user_name'
  | 'user_email'
  | 'nomination_subject'
  | 'org_type'
  | 'career_stage'
  | 'gender_programs'  // optional, opt-in
  | 'company_age'
  | 'org_size'
  | 'tech_orientation'
  | 'recognition_scope'
  | 'achievement_description';  // NEW: Ask about achievements before recommendations

export interface DemographicStep {
  id: DemographicStepId;
  /** Umbrella question phrasing – ask in this style, naturally. */
  umbrellaQuestion: string;
  /** Short label for "what we still need" in prompts. */
  label: string;
  /** If true, we don't block recommendations when missing; ask only when appropriate. */
  optional?: boolean;
}

/** Order of demographic questions. Ask for the first missing one each turn. */
export const DEMOGRAPHIC_STEPS: DemographicStep[] = [
  {
    id: 'user_name',
    umbrellaQuestion: "What's your name?",
    label: 'name',
  },
  {
    id: 'user_email',
    umbrellaQuestion: "Could you share your email address?",
    label: 'email',
  },
  {
    id: 'nomination_subject',
    umbrellaQuestion: "What are you nominating — yourself (individual), a team, your organization, or a product?",
    label: 'what you\'re nominating (individual/team/organization/product)',
  },
  {
    id: 'org_type',
    umbrellaQuestion: "Is this a company, a non-profit, or something else?",
    label: 'organization type (company, non-profit, startup, etc.)',
  },
  {
    id: 'career_stage',
    umbrellaQuestion: "How long have you been doing this kind of work?",
    label: 'career stage / experience',
  },
  {
    id: 'gender_programs',
    umbrellaQuestion: "Some award programs are specifically designed to highlight women leaders. Would you want me to consider those as well?",
    label: 'whether to consider women-in-business programs',
    optional: true,
  },
  {
    id: 'company_age',
    umbrellaQuestion: "How long has the organization been around?",
    label: 'company age / maturity',
  },
  {
    id: 'org_size',
    umbrellaQuestion: "Roughly how big is the team right now?",
    label: 'team size',
  },
  {
    id: 'tech_orientation',
    umbrellaQuestion: "Does technology play a central role in what you do?",
    label: 'technology orientation',
  },
  {
    id: 'recognition_scope',
    umbrellaQuestion: "Are you mainly looking for recognition in the U.S., or are you open to global recognition too?",
    label: 'recognition scope (U.S. vs global)',
  },
  {
    id: 'achievement_description',
    umbrellaQuestion: "Tell me about the specific achievements or contributions you'd like to highlight. What makes this nomination special?",
    label: 'achievement description',
  },
];

/** Context key for each step id (for checking "do we have this?"). */
export const STEP_TO_CONTEXT_KEY: Record<DemographicStepId, string> = {
  user_name: 'user_name',
  user_email: 'user_email',
  nomination_subject: 'nomination_subject',
  org_type: 'org_type',
  career_stage: 'career_stage',
  gender_programs: 'gender_programs_opt_in',
  company_age: 'company_age',
  org_size: 'org_size',
  tech_orientation: 'tech_orientation',
  recognition_scope: 'recognition_scope',
  achievement_description: 'description',
};

/**
 * Returns the first step that is missing from context (required steps only, or all if includeOptional).
 * Used to decide "what to ask next".
 */
export function getFirstMissingStep(
  context: Record<string, any>,
  includeOptional: boolean = false
): DemographicStep | null {
  for (const step of DEMOGRAPHIC_STEPS) {
    if (step.optional && !includeOptional) continue;
    const key = STEP_TO_CONTEXT_KEY[step.id];
    const value = context[key];
    if (value === undefined || value === null || value === '') return step;
  }
  return null;
}

/**
 * All required demographic fields collected (enough to offer program + category recommendations).
 */
export function hasRequiredDemographics(context: Record<string, any>): boolean {
  for (const step of DEMOGRAPHIC_STEPS) {
    if (step.optional) continue;
    const key = STEP_TO_CONTEXT_KEY[step.id];
    const value = context[key];
    if (value === undefined || value === null || value === '') return false;
  }
  return true;
}

/**
 * Minimum needed to generate category recommendations.
 * Geography comes from user profile, so not in DEMOGRAPHIC_STEPS.
 */
export function hasMinimumForRecommendations(context: Record<string, any>): boolean {
  return !!(
    context.user_name &&
    context.user_email &&
    context.geography &&  // From user profile
    context.nomination_subject
  );
}
