import { describe, expect, it } from 'vitest';
import { fixedClock, systemClock } from '../src/lib/clock';

describe('systemClock', () => {
  it('Asia/Seoul 기준 날짜를 돌려준다 (UTC 15:30 = 다음 날 00:30)', () => {
    const clock = systemClock('Asia/Seoul', () => new Date('2026-09-30T15:30:00Z'));
    expect(clock.today()).toBe('2026-10-01');
  });

  it('자정 직전은 같은 날', () => {
    const clock = systemClock('Asia/Seoul', () => new Date('2026-09-30T14:59:59Z'));
    expect(clock.today()).toBe('2026-09-30');
  });

  it('연말 경계', () => {
    const clock = systemClock('Asia/Seoul', () => new Date('2026-12-31T15:00:00Z'));
    expect(clock.today()).toBe('2027-01-01');
  });
});

describe('fixedClock', () => {
  it('주어진 날짜를 그대로 돌려준다', () => {
    expect(fixedClock('2028-02-29').today()).toBe('2028-02-29');
  });
});
