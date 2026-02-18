import { intakeAssistant } from './intakeAssistant';
import { openaiService } from './openaiService';

jest.mock('./openaiService', () => {
  return {
    openaiService: {
      chatCompletion: jest.fn(),
    },
  };
});

describe('IntakeAssistant.planNext (Option A)', () => {
  const mockedChat = openaiService.chatCompletion as unknown as jest.Mock;

  beforeEach(() => {
    mockedChat.mockReset();
  });

  it('parses updates + next_field + next_question JSON', async () => {
    mockedChat.mockResolvedValue(
      JSON.stringify({
        updates: { user_name: 'Syed', nomination_subject: 'team' },
        next_field: 'user_email',
        next_question: "What's your email address?",
        ready_for_recommendations: false,
      })
    );

    const res = await intakeAssistant.planNext({
      userContext: {},
      message: 'my name is syed and i want to nominate my team',
    });

    expect(res.updates.user_name).toBe('Syed');
    expect(res.updates.nomination_subject).toBe('team');
    expect(res.next_field).toBe('user_email');
    expect(res.next_question.toLowerCase()).toContain('email');
  });

  it('filters updates to only allowed keys', async () => {
    mockedChat.mockResolvedValue(
      JSON.stringify({
        updates: { user_name: 'Syed', some_other_key: 'x' },
        next_field: 'user_email',
        next_question: "What's your email address?",
        ready_for_recommendations: false,
      })
    );

    const res = await intakeAssistant.planNext({ userContext: {}, message: 'hi', signal: undefined });
    expect(res.updates.user_name).toBe('Syed');
    expect((res.updates as any).some_other_key).toBeUndefined();
  });
});
