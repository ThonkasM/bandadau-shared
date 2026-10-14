import { describe, expect, it } from 'vitest';

import { createProblem, isProblem, isProblemWithCode, problemTypeUrl } from '../src/problem';

describe('problem helpers', () => {
  it('recognizes Problem Details', () => {
    expect(
      isProblem({ type: 'https://api.bandadau.com/problems/not-found', title: 'x', status: 404, code: 'NOT_FOUND' }),
    ).toBe(true);
  });
  it('rejects non problems', () => {
    expect(isProblem(null)).toBe(false);
    expect(isProblem('x')).toBe(false);
    expect(isProblem({ status: 200, code: 'X', title: 't', type: 'u' })).toBe(false);
    expect(isProblem({ status: 404, title: 't', type: 'u' })).toBe(false);
  });
  it('matches by code', () => {
    const p = createProblem({ status: 409, code: 'EVENT_FULL' });
    expect(isProblemWithCode(p, 'EVENT_FULL')).toBe(true);
    expect(isProblemWithCode(p, 'OTHER')).toBe(false);
  });
  it('builds the type url from the code', () => {
    expect(problemTypeUrl('IDEMPOTENCY_KEY_REUSED')).toBe('https://api.bandadau.com/problems/idempotency-key-reused');
    expect(createProblem({ status: 400, code: 'VALIDATION_FAILED', errors: [{ field: 'a', code: 'REQUIRED', message: 'm' }] }).errors).toHaveLength(1);
  });
});
