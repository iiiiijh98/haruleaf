export const FULL_GROWTH_PERCENT = 80;

export type GrowthStage = 1 | 2 | 3 | 4 | 5;

/** 성장률 = 작성일수 ÷ 해당 월 전체 일수 × 100 (반올림 없음, 100 상한). */
export function growthPercent(writtenDays: number, totalDays: number): number {
  if (!Number.isInteger(writtenDays) || writtenDays < 0) {
    throw new RangeError(`작성일수가 올바르지 않습니다: ${writtenDays}`);
  }
  if (!Number.isInteger(totalDays) || totalDays < 28 || totalDays > 31) {
    throw new RangeError(`월 일수가 올바르지 않습니다: ${totalDays}`);
  }
  return Math.min(100, (writtenDays / totalDays) * 100);
}

/** 반올림 전 성장률로 단계를 판정한다: 0~19 / 20~39 / 40~59 / 60~79 / 80~100. */
export function growthStage(percent: number): GrowthStage {
  if (percent >= FULL_GROWTH_PERCENT) return 5;
  if (percent >= 60) return 4;
  if (percent >= 40) return 3;
  if (percent >= 20) return 2;
  return 1;
}

export function isFullyGrown(percent: number): boolean {
  return percent >= FULL_GROWTH_PERCENT;
}

/** 화면 표시용 성장률(소수점 첫째 자리, BR-05). 단계 판정에는 쓰지 않는다. */
export function formatGrowthPercent(percent: number): string {
  return (Math.round(percent * 10) / 10).toFixed(1);
}
