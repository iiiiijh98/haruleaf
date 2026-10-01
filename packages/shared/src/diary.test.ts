import { describe, expect, it } from 'vitest';
import { diaryBodySchema, diaryDateSchema, diaryInputSchema, monthKeySchema, selectPlantSchema } from './diary';

const first = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? undefined : result.error?.issues[0]?.message;

describe('diaryBodySchema', () => {
  it('앞뒤 공백은 지우고 내부 줄바꿈은 유지한다', () => {
    expect(diaryBodySchema.parse('  오늘은\n맑았다  ')).toBe('오늘은\n맑았다');
  });

  it('10,000자까지 허용, 10,001자는 거절', () => {
    expect(diaryBodySchema.parse('가'.repeat(10000))).toHaveLength(10000);
    expect(first(diaryBodySchema.safeParse('가'.repeat(10001)))).toBe('일기는 1~10,000자로 써주세요.');
  });

  it.each(['', '   ', '\n\n'])('빈 본문 %j 거절', (value) => {
    expect(first(diaryBodySchema.safeParse(value))).toBe('일기는 1~10,000자로 써주세요.');
  });

  it('NUL 문자 거절', () => {
    expect(first(diaryBodySchema.safeParse('오늘\u0000'))).toBe('사용할 수 없는 문자가 들어 있어요.');
  });

  it('diaryInputSchema는 본문이 없으면 폼 메시지', () => {
    expect(first(diaryInputSchema.safeParse(undefined))).toBe('입력값을 확인해주세요.');
  });
});

describe('selectPlantSchema', () => {
  it('식물 코드를 받는다', () => {
    expect(selectPlantSchema.parse({ plantId: 'monstera' })).toEqual({ plantId: 'monstera' });
    expect(first(selectPlantSchema.safeParse({ plantId: '' }))).toBe('식물을 골라주세요.');
  });
});

describe('monthKeySchema · diaryDateSchema', () => {
  it.each(['2026-10', '2026-01', '2026-12'])('월 %s 허용', (value) => {
    expect(monthKeySchema.parse(value)).toBe(value);
  });
  it.each(['2026-13', '2026-1', '26-10', '2026-10-01'])('월 %s 거절', (value) => {
    expect(first(monthKeySchema.safeParse(value))).toBe('월 형식이 올바르지 않아요.');
  });
  it.each(['2026-10-15', '2028-02-29'])('날짜 %s 허용', (value) => {
    expect(diaryDateSchema.parse(value)).toBe(value);
  });
  it.each(['2026-02-30', '2026-02-29', '2026-10-32', '2026-10-1', 'today'])('날짜 %s 거절', (value) => {
    expect(first(diaryDateSchema.safeParse(value))).toBe('날짜 형식이 올바르지 않아요.');
  });
});
