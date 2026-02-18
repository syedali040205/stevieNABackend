import { applyAnswer } from './intakeFlow';

describe('intakeFlow.applyAnswer', () => {
  it('stores raw answer for any pending field', () => {
    const res = applyAnswer({ pendingField: 'user_email', message: 'not-an-email', userContext: {} });
    expect(res.accepted).toBe(true);
    expect(res.updatedContext.user_email).toBe('not-an-email');
  });
});
