import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { monthlyRecords } from '../src/db/schema';
import { seedCatalog } from '../src/db/seed';
import type { PickUnlock } from '../src/domain/closing';
import { bearer } from './auth-helpers';
import { createTestDb, resetDatabase } from './helpers';
import { datesInMonth, insertDiaries, mutableClock, signupUser } from './months-helpers';

const { db, pool } = createTestDb();
const clock = mutableClock('2026-11-02');
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
  clock.set('2026-11-02');
  await resetDatabase(db);
  await seedCatalog(db);
});

const garden = (token: string, query = '') => app.inject({ method: 'GET', url: `/garden${query}`, headers: bearer(token) });
const gardenMonth = (token: string, month: string) => app.inject({ method: 'GET', url: `/garden/${month}`, headers: bearer(token) });

async function pastMonth(userId: string, month: string, plantId: string | null, days: number, totalDays: number) {
  await db.insert(monthlyRecords).values({ userId, month: `${month}-01`, totalDays, plantId, selectionLocked: days > 0 });
  await insertDiaries(db, userId, datesInMonth(month, days));
}

const ROSE = { id: 'rose', name: '장미', kind: 'FLOWER', catalogClass: 'STANDARD' };
const HYDRANGEA = { id: 'hydrangea', name: '수국', kind: 'FLOWER', catalogClass: 'STANDARD' };

describe('GET /garden', () => {
  it('12개월 카드를 상태별로 돌려준다', async () => {
    const { token, userId } = await signupUser(app);
    await pastMonth(userId, '2026-08', null, 0, 31);
    await pastMonth(userId, '2026-10', 'rose', 25, 31);
    const response = await garden(token, '?year=2026');
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ year: 2026, minYear: 2026, maxYear: 2026 });
    expect(body.months).toHaveLength(12);
    expect(body.months.map((card: { month: string }) => card.month)).toEqual(
      Array.from({ length: 12 }, (_, index) => `2026-${String(index + 1).padStart(2, '0')}`),
    );
    expect(body.months[0]).toEqual({
      month: '2026-01',
      status: 'EMPTY',
      plant: null,
      writtenDays: 0,
      totalDays: 31,
      growthPercent: 0,
      growthStage: 1,
      fullyGrown: false,
      unlockedPlant: null,
    });
    expect(body.months[7]).toMatchObject({ month: '2026-08', status: 'NO_PLANT', plant: null });
    expect(body.months[9]).toEqual({
      month: '2026-10',
      status: 'FINALIZED',
      plant: ROSE,
      writtenDays: 25,
      totalDays: 31,
      growthPercent: 80.65,
      growthStage: 5,
      fullyGrown: true,
      unlockedPlant: HYDRANGEA,
    });
    expect(body.months[10]).toMatchObject({ month: '2026-11', status: 'CURRENT', plant: null, totalDays: 30 });
    expect(body.months[11]).toMatchObject({ month: '2026-12', status: 'EMPTY' });
  });

  it('이번 달은 실시간 성장률', async () => {
    const { token, userId } = await signupUser(app);
    await db.insert(monthlyRecords).values({ userId, month: '2026-11-01', totalDays: 30, plantId: 'tulip', selectionLocked: true });
    await insertDiaries(db, userId, datesInMonth('2026-11', 2));
    expect((await garden(token)).json().months[10]).toMatchObject({ status: 'CURRENT', writtenDays: 2, growthStage: 1, unlockedPlant: null });
  });

  it('연도를 생략하면 올해', async () => {
    const { token } = await signupUser(app);
    expect((await garden(token)).json().year).toBe(2026);
  });

  it('가장 이른 기록 연도부터 올해까지 볼 수 있다', async () => {
    const { token, userId } = await signupUser(app);
    await pastMonth(userId, '2025-03', 'rose', 1, 31);
    const body = (await garden(token, '?year=2025')).json();
    expect(body).toMatchObject({ year: 2025, minYear: 2025, maxYear: 2026 });
    expect(body.months[2]).toMatchObject({ month: '2025-03', status: 'FINALIZED', writtenDays: 1 });
  });

  it.each(['?year=2025', '?year=2027'])('범위 밖 연도 %s 는 400', async (query) => {
    const { token } = await signupUser(app);
    const response = await garden(token, query);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: 'INVALID_YEAR', message: '볼 수 없는 연도예요.' } });
  });

  it.each(['?year=abc', '?year=26', '?year=2026.5'])('형식 오류 %s 는 400', async (query) => {
    const { token } = await signupUser(app);
    expect((await garden(token, query)).statusCode).toBe(400);
  });

  it('정원을 열면 지난달을 마감한다', async () => {
    const { token, userId } = await signupUser(app);
    await pastMonth(userId, '2026-10', 'rose', 25, 31);
    await garden(token);
    const plantsList = (await app.inject({ method: 'GET', url: '/plants', headers: bearer(token) })).json().plants;
    expect(plantsList.find((plant: { id: string }) => plant.id === 'hydrangea').owned).toBe(true);
  });

  it('다른 사용자의 기록은 보이지 않는다', async () => {
    const a = await signupUser(app, 'haru_01');
    const b = await signupUser(app, 'haru_02');
    await pastMonth(b.userId, '2026-10', 'rose', 25, 31);
    expect((await garden(a.token)).json().months[9].status).toBe('EMPTY');
  });
});

describe('GET /garden/:month', () => {
  it('월 카드 하나', async () => {
    const { token, userId } = await signupUser(app);
    await pastMonth(userId, '2026-10', 'rose', 25, 31);
    const response = await gardenMonth(token, '2026-10');
    expect(response.statusCode).toBe(200);
    expect(response.json().month).toMatchObject({ month: '2026-10', status: 'FINALIZED', plant: ROSE, unlockedPlant: HYDRANGEA });
  });

  it('형식 오류는 400, 범위 밖 연도는 INVALID_YEAR', async () => {
    const { token } = await signupUser(app);
    expect((await gardenMonth(token, '2026-13')).statusCode).toBe(400);
    expect((await gardenMonth(token, '2027-01')).json().error.code).toBe('INVALID_YEAR');
  });
});
