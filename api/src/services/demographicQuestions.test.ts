import { normalizeSkippableAnswer } from './demographicQuestions';

describe('normalizeSkippableAnswer', () => {
  test('does not treat empty/whitespace as skipped', () => {
    expect(normalizeSkippableAnswer('')).toEqual({ skipped: false, value: '' });
    expect(normalizeSkippableAnswer('   ')).toEqual({ skipped: false, value: '' });
  });

  test('treats common explicit skip tokens as skipped (punctuation/case tolerant)', () => {
    const cases = ['skip', 'SKIP', 'skip.', 'skip!', 'n/a', 'N.A.', 'na', 'n a', 'not sure', "don't know", 'dont know', 'nope', 'nah', 'prefer not'];

    for (const c of cases) {
      const r = normalizeSkippableAnswer(c);
      expect(r.skipped).toBe(true);
      expect(r.value).toBe('__skipped__');
    }
  });

  test('non-skip content is not skipped and preserves original trimmed value', () => {
    const r = normalizeSkippableAnswer('  15% increase YoY. ');
    expect(r.skipped).toBe(false);
    expect(r.value).toBe('15% increase YoY.');
  });
});
