import { describe, expect, it } from 'vitest';
import { daysInMonth, formatMonthLabel, monthKeyOf, shiftMonth } from './calendar';

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

describe('월 도우미', () => {
  it('monthKeyOf', () => {
    expect(monthKeyOf('2026-10-15')).toBe('2026-10');
  });

  it.each([
    ['2026-10', -1, '2026-09'],
    ['2026-01', -1, '2025-12'],
    ['2026-12', 1, '2027-01'],
    ['2026-10', 0, '2026-10'],
    ['2026-10', -13, '2025-09'],
  ])('shiftMonth(%s, %i) = %s', (month, delta, expected) => {
    expect(shiftMonth(month, delta)).toBe(expected);
  });

  it('formatMonthLabel', () => {
    expect(formatMonthLabel('2026-10')).toBe('2026년 10월');
    expect(formatMonthLabel('2027-01')).toBe('2027년 1월');
  });
});
