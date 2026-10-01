import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { diaries, monthlyRecords } from '../src/db/schema';
import { seedCatalog } from '../src/db/seed';
import type { PickUnlock } from '../src/domain/closing';
import { seedMonth } from '../src/domain/seed-month';
import { bearer } from './auth-helpers';
import { createTestDb, resetDatabase } from './helpers';
import { mutableClock, signupUser } from './months-helpers';

const { db, pool } = createTestDb();
const clock = mutableClock('2026-10-15');
const pickFirst: PickUnlock = (ids) => ids[0]!;
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ db, clock, corsOrigins: [], pickUnlock: pickFirst });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

beforeEach(async () => {
  clock.set('2026-10-15');
  await resetDatabase(db);
  await seedCatalog(db);
});

const TODAY = '2026-10-15';

describe('seedMonth', () => {
  it('지난달 식물과 1일~n일 일기를 넣고, 홈을 열면 마감·해금된다', async () => {
    const { token, userId } = await signupUser(app);
    expect(await seedMonth(db, 'haru_01', '2026-09', 'rose', 24, TODAY)).toEqual({ month: '2026-09', writtenDays: 24 });
    const [record] = await db.select().from(monthlyRecords).where(and(eq(monthlyRecords.userId, userId), eq(monthlyRecords.month, '2026-09-01')));
    expect(record).toMatchObject({ plantId: 'rose', selectionLocked: true, totalDays: 30, finalized: false });
    const rows = await db.select().from(diaries).where(eq(diaries.userId, userId));
    expect(rows.map((row) => row.diaryDate).sort()[0]).toBe('2026-09-01');
    expect(rows).toHaveLength(24);
    expect(rows.every((row) => row.body === '시연용 일기입니다.')).toBe(true);
    const home = (await app.inject({ method: 'GET', url: '/home', headers: bearer(token) })).json();
    expect(home.newUnlocks).toEqual([{ month: '2026-09', plant: { id: 'hydrangea', name: '수국', kind: 'FLOWER', catalogClass: 'STANDARD' } }]);
  });

  it('이미 있는 날짜의 일기는 그대로 둔다', async () => {
    const { userId } = await signupUser(app);
    await db.insert(diaries).values({ userId, diaryDate: '2026-09-01', body: '진짜 일기' });
    expect((await seedMonth(db, 'haru_01', '2026-09', 'rose', 3, TODAY)).writtenDays).toBe(3);
    const [first] = await db.select().from(diaries).where(and(eq(diaries.userId, userId), eq(diaries.diaryDate, '2026-09-01')));
    expect(first!.body).toBe('진짜 일기');
  });

  it('0일이면 식물만 정하고 잠그지 않는다', async () => {
    const { userId } = await signupUser(app);
    await seedMonth(db, 'haru_01', '2026-09', 'rose', 0, TODAY);
    const [record] = await db.select().from(monthlyRecords).where(eq(monthlyRecords.userId, userId));
    expect(record).toMatchObject({ plantId: 'rose', selectionLocked: false });
  });

  it.each([
    ['nobody', '2026-09', 'rose', 10, '아이디를 찾을 수 없습니다: nobody'],
    ['haru_01', '2026-10', 'rose', 10, '지난 달만 넣을 수 있어요: 2026-10'],
    ['haru_01', '2026-11', 'rose', 10, '지난 달만 넣을 수 있어요: 2026-11'],
    ['haru_01', '2026-9', 'rose', 10, '월 형식이 올바르지 않아요.'],
    ['haru_01', '2026-09', 'moonflower', 10, '보유한 식물만 넣을 수 있어요: moonflower'],
    ['haru_01', '2026-09', 'nothing', 10, '보유한 식물만 넣을 수 있어요: nothing'],
    ['haru_01', '2026-09', 'rose', 31, '일수는 0~30 사이 정수로 넣어주세요.'],
    ['haru_01', '2026-09', 'rose', -1, '일수는 0~30 사이 정수로 넣어주세요.'],
    ['haru_01', '2026-09', 'rose', 1.5, '일수는 0~30 사이 정수로 넣어주세요.'],
  ])('%s %s %s %d 거절', async (loginId, month, plantId, days, message) => {
    await signupUser(app);
    await expect(seedMonth(db, loginId, month, plantId, days, TODAY)).rejects.toThrow(message);
    expect(await db.select().from(diaries)).toHaveLength(0);
  });

  it('이미 마감된 달은 거절', async () => {
    const { token } = await signupUser(app);
    await seedMonth(db, 'haru_01', '2026-09', 'rose', 5, TODAY);
    await app.inject({ method: 'GET', url: '/home', headers: bearer(token) });
    await expect(seedMonth(db, 'haru_01', '2026-09', 'rose', 10, TODAY)).rejects.toThrow('이미 마감된 달이에요: 2026-09');
  });
});
