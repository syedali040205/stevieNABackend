export type IntakeField =
  | 'user_name'
  | 'user_email'
  | 'nomination_subject'
  | 'org_type'
  | 'gender_programs_opt_in'
  | 'recognition_scope'
  | 'geography'
  | 'nomination_scope'
  | 'description'
  | 'achievement_impact'
  | 'achievement_innovation'
  | 'achievement_challenges';

function norm(s: string): string {
  return (s || '').trim();
}

/**
 * Append/store the user's raw answer into the pending field.
 * No validation/logic here by design; validation is handled by the LLM planning layer.
 * 
 * Special handling:
 * - geography: Maps user input to database geography values (e.g., "India" → "Asia-Pacific")
 */
export function applyAnswer(params: {
  pendingField: IntakeField;
  message: string;
  userContext: any;
}): { updatedContext: any; accepted: boolean; error?: string } {
  const { pendingField, message, userContext } = params;
  const ctx = { ...(userContext || {}) };
  const raw = norm(message);

  if (!raw) return { updatedContext: ctx, accepted: false, error: 'empty' };

  // Special handling for geography field - store raw value
  // Mapping will be done when generating recommendations using both geography and nomination_scope
  if (pendingField === 'geography' || pendingField === 'nomination_scope') {
    ctx[pendingField] = raw.substring(0, 1200);
  } else {
    ctx[pendingField] = raw.substring(0, 1200);
  }
  
  return { updatedContext: ctx, accepted: true };
}
