import { describe, expect, it } from 'vitest';
import { catalogClassLabel, unlockAckSchema } from './garden';

const first = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? undefined : result.error?.issues[0]?.message;

describe('catalogClassLabel', () => {
  it.each([
    ['STANDARD', '기본'],
    ['LIMITED', '한정'],
    ['SPECIAL', '스페셜'],
  ] as const)('%s → %s', (cls, label) => {
    expect(catalogClassLabel(cls)).toBe(label);
  });
});

describe('unlockAckSchema', () => {
  it('월 목록을 받는다', () => {
    expect(unlockAckSchema.parse({ months: ['2026-09', '2026-08'] })).toEqual({ months: ['2026-09', '2026-08'] });
  });

  it.each([{}, { months: [] }, { months: ['2026-9'] }, { months: Array.from({ length: 25 }, () => '2026-09') }])(
    '잘못된 본문 %j 거절',
    (body) => {
      expect(unlockAckSchema.safeParse(body).success).toBe(false);
    },
  );

  it('빈 목록 메시지', () => {
    expect(first(unlockAckSchema.safeParse({ months: [] }))).toBe('확인할 달을 골라주세요.');
  });
});
