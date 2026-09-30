import { describe, expect, it } from 'vitest';
import { daysInMonth } from './calendar';

describe('daysInMonth', () => {
  it.each([
    [2026, 2, 28],
    [2028, 2, 29],
    [2100, 2, 28],
    [2000, 2, 29],
    [2026, 9, 30],
    [2026, 10, 31],
    [2026, 12, 31],
    [2027, 1, 31],
  ])('%i년 %i월은 %i일', (year, month, expected) => {
    expect(daysInMonth(year, month)).toBe(expected);
  });

  it.each([0, 13, 1.5])('잘못된 월 %s는 RangeError', (month) => {
    expect(() => daysInMonth(2026, month)).toThrow(RangeError);
  });
});
