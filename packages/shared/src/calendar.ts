/** 해당 연·월(1~12)의 실제 일수(28/29/30/31). */
export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`잘못된 연월입니다: ${year}-${month}`);
  }
  // 다음 달 0일 = 이번 달 마지막 날
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
