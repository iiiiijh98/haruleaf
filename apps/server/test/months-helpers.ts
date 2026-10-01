import type { FastifyInstance } from 'fastify';
import type { Db } from '../src/db/client';
import { diaries } from '../src/db/schema';
import type { Clock } from '../src/lib/clock';
import { signupViaApi } from './auth-helpers';

export function mutableClock(initial: string): Clock & { set(date: string): void } {
  let current = initial;
  return {
    today: () => current,
    set: (date: string) => {
      current = date;
    },
  };
}

export async function signupUser(app: FastifyInstance, loginId = 'haru_01'): Promise<{ token: string; userId: string }> {
  const body = (await signupViaApi(app, { loginId })).json();
  return { token: body.token, userId: body.user.id };
}

/** 'YYYY-MM'의 1일부터 count일까지 날짜 목록 */
export function datesInMonth(month: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
}

export async function insertDiaries(db: Db, userId: string, dates: string[]): Promise<void> {
  if (dates.length === 0) return;
  await db.insert(diaries).values(dates.map((diaryDate) => ({ userId, diaryDate, body: '기록' })));
}
