export type IntakeField =
  | 'user_name'
  | 'user_email'
  | 'nomination_subject'
  | 'org_type'
  | 'gender_programs_opt_in'
  | 'recognition_scope'
  | 'geography'
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

  ctx[pendingField] = raw.substring(0, 1200);
  return { updatedContext: ctx, accepted: true };
}
