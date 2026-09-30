export interface Clock {
  /** 서버 기준 시간대의 오늘 날짜, YYYY-MM-DD */
  today(): string;
}

export function systemClock(timeZone: string, now: () => Date = () => new Date()): Clock {
  // en-CA 로캘은 YYYY-MM-DD 형식으로 출력한다.
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return { today: () => formatter.format(now()) };
}

export function fixedClock(date: string): Clock {
  return { today: () => date };
}
