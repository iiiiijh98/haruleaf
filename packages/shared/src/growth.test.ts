import { describe, expect, it } from 'vitest';
import { FULL_GROWTH_PERCENT, formatGrowthPercent, growthPercent, growthStage, isFullyGrown } from './growth';

describe('growthPercent', () => {
  it('해당 월 전체 일수를 분모로 쓴다', () => {
    expect(growthPercent(9, 30)).toBe(30);
    expect(growthPercent(10, 31)).toBeCloseTo(32.258, 3);
  });

  it('반올림하지 않은 값을 돌려준다', () => {
    expect(growthPercent(24, 31)).toBeCloseTo(77.419, 3);
    expect(growthPercent(25, 31)).toBeCloseTo(80.645, 3);
  });

  it('100을 넘지 않는다', () => {
    expect(growthPercent(31, 30)).toBe(100);
  });

  it('0일이면 0', () => {
    expect(growthPercent(0, 28)).toBe(0);
  });

  it.each([
    [-1, 30],
    [1.5, 30],
    [5, 27],
    [5, 32],
  ])('잘못된 입력 (%s, %s)는 RangeError', (written, total) => {
    expect(() => growthPercent(written, total)).toThrow(RangeError);
  });
});

describe('growthStage', () => {
  it.each([
    [0, 1],
    [19.99, 1],
    [20, 2],
    [39.99, 2],
    [40, 3],
    [59.99, 3],
    [60, 4],
    [79.99, 4],
    [80, 5],
    [100, 5],
  ])('%s%% → %i단계', (percent, stage) => {
    expect(growthStage(percent)).toBe(stage);
  });
});

describe('isFullyGrown', () => {
  it('80% 이상만 완전 성장', () => {
    expect(FULL_GROWTH_PERCENT).toBe(80);
    expect(isFullyGrown(79.99)).toBe(false);
    expect(isFullyGrown(80)).toBe(true);
    expect(isFullyGrown(growthPercent(24, 31))).toBe(false);
    expect(isFullyGrown(growthPercent(25, 31))).toBe(true);
    expect(isFullyGrown(growthPercent(24, 30))).toBe(true);
  });
});

describe('formatGrowthPercent', () => {
  it.each([
    [0, '0.0'],
    [100 / 31, '3.2'],
    [(24 / 31) * 100, '77.4'],
    [(25 / 31) * 100, '80.6'],
    [100, '100.0'],
  ])('%s → %s', (percent, expected) => {
    expect(formatGrowthPercent(percent)).toBe(expected);
  });
});
