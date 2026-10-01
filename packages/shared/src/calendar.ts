/** 해당 연·월(1~12)의 실제 일수(28/29/30/31). */
export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`잘못된 연월입니다: ${year}-${month}`);
  }
  // 다음 달 0일 = 이번 달 마지막 날
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 'YYYY-MM-DD' → 'YYYY-MM' */
export function monthKeyOf(date: string): string {
  return date.slice(0, 7);
}

/** 'YYYY-MM'을 delta개월 이동 */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const index = year * 12 + (monthNumber - 1) + delta;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

/** 'YYYY-MM' → 'YYYY년 M월' */
export function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  return `${year}년 ${monthNumber}월`;
}
