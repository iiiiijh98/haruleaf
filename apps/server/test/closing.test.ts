import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { coinTransactions, monthlyRecords, plants, userPlants, users } from '../src/db/schema';
import { seedCatalog } from '../src/db/seed';
import { closePastMonths, type PickUnlock } from '../src/domain/closing';
import { monthSnapshot } from '../src/domain/months';
import { bearer } from './auth-helpers';
import { fireConcurrently } from './concurrency';
import { createTestDb, resetDatabase } from './helpers';
import { datesInMonth, insertDiaries, mutableClock, signupUser } from './months-helpers';

const { db, pool } = createTestDb();
const clock = mutableClock('2026-10-15');
const picks: string[][] = [];
/** 후보 목록을 기록하고 첫 번째를 고른다(결정적). */
const pickFirst: PickUnlock = (ids) => {
  picks.push(ids);
  return ids[0]!;
};
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
  picks.length = 0;
  await resetDatabase(db);
  await seedCatalog(db);
});

const home = (token: string) => app.inject({ method: 'GET', url: '/home', headers: bearer(token) });

/** 지난달 행을 식물과 함께 만들고 1일부터 days일까지 일기를 넣는다. */
async function pastMonth(userId: string, month: string, plantId: string | null, days: number, totalDays: number) {
  await db.insert(monthlyRecords).values({ userId, month: `${month}-01`, totalDays, plantId, selectionLocked: days > 0 });
  await insertDiaries(db, userId, datesInMonth(month, days));
}

const recordOf = async (userId: string, month: string) =>
  (await db.select().from(monthlyRecords).where(and(eq(monthlyRecords.userId, userId), eq(monthlyRecords.month, `${month}-01`))))[0]!;

const achievements = (userId: string) =>
  db.select().from(userPlants).where(and(eq(userPlants.userId, userId), eq(userPlants.unlockSource, 'ACHIEVEMENT')));

describe('월 마감', () => {
  it('31일 달 24일 작성은 확정만 하고 해금하지 않는다', async () => {
    const { token, userId } = await signupUser(app);
    clock.set('2026-11-02');
    await pastMonth(userId, '2026-10', 'rose', 24, 31);
    expect((await home(token)).statusCode).toBe(200);
    const record = await recordOf(userId, '2026-10');
    expect(record).toMatchObject({ finalized: true, writtenDays: 24, growthPercent: '77.42', growthStage: 4, unlockedPlantId: null });
    expect(record.finalizedAt).toBeInstanceOf(Date);
    expect(await achievements(userId)).toHaveLength(0);
  });

  it('31일 달 25일 작성은 미보유 STANDARD 1종을 해금한다', async () => {
    const { token, userId } = await signupUser(app);
    clock.set('2026-11-02');
    await pastMonth(userId, '2026-10', 'rose', 25, 31);
    await home(token);
    expect(picks).toEqual([['hydrangea', 'daisy']]);
    const record = await recordOf(userId, '2026-10');
    expect(record).toMatchObject({ finalized: true, writtenDays: 25, growthPercent: '80.65', growthStage: 5, unlockedPlantId: 'hydrangea' });
    const unlocked = await achievements(userId);
    expect(unlocked.map((row) => row.plantId)).toEqual(['hydrangea']);
  });

  it('식물을 고르지 않은 달은 확정만 한다', async () => {
    const { token, userId } = await signupUser(app);
    clock.set('2026-11-02');
    await pastMonth(userId, '2026-10', null, 0, 31);
    await home(token);
    expect(await recordOf(userId, '2026-10')).toMatchObject({ finalized: true, writtenDays: 0, growthPercent: '0.00', growthStage: 1, unlockedPlantId: null });
    expect(picks).toEqual([]);
  });

  it('미보유 STANDARD가 없으면 해금 없이 확정', async () => {
    const { token, userId } = await signupUser(app);
    await db.insert(userPlants).values([
      { userId, plantId: 'hydrangea', unlockSource: 'ACHIEVEMENT' },
      { userId, plantId: 'daisy', unlockSource: 'ACHIEVEMENT' },
    ]);
    clock.set('2026-11-02');
    await pastMonth(userId, '2026-10', 'rose', 31, 31);
    await home(token);
    expect(await recordOf(userId, '2026-10')).toMatchObject({ finalized: true, growthPercent: '100.00', unlockedPlantId: null });
    expect(picks).toEqual([]);
  });

  it('비활성 STANDARD는 후보에서 빠진다', async () => {
    const { token, userId } = await signupUser(app);
    await db.update(plants).set({ isActive: false }).where(eq(plants.id, 'hydrangea'));
    clock.set('2026-11-02');
    await pastMonth(userId, '2026-10', 'rose', 25, 31);
    await home(token);
    expect(picks).toEqual([['daisy']]);
  });

  it('밀린 달은 순서대로 확정하고 같은 식물을 두 번 주지 않는다', async () => {
    const { token, userId } = await signupUser(app);
    clock.set('2026-12-03');
    await pastMonth(userId, '2026-10', 'rose', 25, 31);
    await pastMonth(userId, '2026-11', 'tulip', 24, 30);
    await home(token);
    expect(picks).toEqual([['hydrangea', 'daisy'], ['daisy']]);
    expect((await recordOf(userId, '2026-10')).unlockedPlantId).toBe('hydrangea');
    expect((await recordOf(userId, '2026-11')).unlockedPlantId).toBe('daisy');
    expect((await achievements(userId)).map((row) => row.plantId).sort()).toEqual(['daisy', 'hydrangea']);
  });

  it('이미 마감된 달은 다시 쓰지 않는다', async () => {
    const { token, userId } = await signupUser(app);
    clock.set('2026-11-02');
    await pastMonth(userId, '2026-10', 'rose', 25, 31);
    await home(token);
    const first = await recordOf(userId, '2026-10');
    await home(token);
    const second = await recordOf(userId, '2026-10');
    expect(second.finalizedAt).toEqual(first.finalizedAt);
    expect(second.unlockedPlantId).toBe(first.unlockedPlantId);
    expect(picks).toHaveLength(1);
  });

  it('이번 달은 마감하지 않는다', async () => {
    const { token, userId } = await signupUser(app);
    await home(token);
    expect((await recordOf(userId, '2026-10')).finalized).toBe(false);
  });

  it('동시에 10번 홈을 열어도 해금은 1건', async () => {
    const { token, userId } = await signupUser(app);
    clock.set('2026-11-02');
    await pastMonth(userId, '2026-10', 'rose', 25, 31);
    const results = await fireConcurrently(10, () => home(token));
    expect(results.every((result) => result.statusCode === 200)).toBe(true);
    expect(await achievements(userId)).toHaveLength(1);
    expect(picks).toHaveLength(1);
  });

  it('식물 목록 요청도 마감을 먼저 처리한다', async () => {
    const { token, userId } = await signupUser(app);
    clock.set('2026-11-02');
    await pastMonth(userId, '2026-10', 'rose', 25, 31);
    const list = (await app.inject({ method: 'GET', url: '/plants', headers: bearer(token) })).json().plants;
    expect(list.find((plant: { id: string }) => plant.id === 'hydrangea').owned).toBe(true);
  });

  it('마감은 코인을 건드리지 않는다', async () => {
    const { token, userId } = await signupUser(app);
    clock.set('2026-11-02');
    await pastMonth(userId, '2026-10', 'rose', 25, 31);
    await home(token);
    expect((await db.select().from(users).where(eq(users.id, userId)))[0]!.coinBalance).toBe(0);
    expect(await db.select().from(coinTransactions)).toHaveLength(0);
  });

  it('다른 사용자의 달은 마감하지 않는다', async () => {
    const a = await signupUser(app, 'haru_01');
    const b = await signupUser(app, 'haru_02');
    clock.set('2026-11-02');
    await pastMonth(b.userId, '2026-10', 'rose', 25, 31);
    await home(a.token);
    expect((await recordOf(b.userId, '2026-10')).finalized).toBe(false);
  });

  it('후보 밖의 식물을 고르면 오류이고 아무것도 확정되지 않는다', async () => {
    const { userId } = await signupUser(app);
    await pastMonth(userId, '2026-10', 'rose', 25, 31);
    await expect(closePastMonths(db, userId, '2026-11-02', () => 'moonflower')).rejects.toThrow();
    expect((await recordOf(userId, '2026-10')).finalized).toBe(false);
    expect(await achievements(userId)).toHaveLength(0);
  });
});

describe('마감된 달 스냅샷', () => {
  it('저장된 확정값을 쓴다', async () => {
    const { userId } = await signupUser(app);
    await pastMonth(userId, '2026-10', 'rose', 25, 31);
    await closePastMonths(db, userId, '2026-11-02', pickFirst);
    // 확정값만 바꿔 저장값을 읽는지 확인한다(실제로는 마감 후 일기가 바뀌지 않는다).
    await db
      .update(monthlyRecords)
      .set({ writtenDays: 10, growthPercent: '32.26', growthStage: 2 })
      .where(and(eq(monthlyRecords.userId, userId), eq(monthlyRecords.month, '2026-10-01')));
    expect(await monthSnapshot(db, userId, '2026-10-01')).toMatchObject({
      month: '2026-10',
      writtenDays: 10,
      totalDays: 31,
      growthPercent: 32.26,
      growthStage: 2,
      fullyGrown: false,
      plant: { id: 'rose' },
    });
  });
});
