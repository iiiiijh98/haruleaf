import { describe, expect, it } from 'vitest';
import { hasNoNul } from './text';

describe('hasNoNul', () => {
  it('NUL 문자가 없으면 true', () => {
    expect(hasNoNul('하루 한 잎\n둘째 줄')).toBe(true);
  });
  it('NUL 문자가 있으면 false', () => {
    expect(hasNoNul('a\u0000b')).toBe(false);
  });
});
