import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { monthlyRecords, plants, userPlants } from '../src/db/schema';
import { seedCatalog } from '../src/db/seed';
import { bearer } from './auth-helpers';
import { createTestDb, resetDatabase } from './helpers';
import { datesInMonth, insertDiaries, mutableClock, signupUser } from './months-helpers';

const { db, pool } = createTestDb();
const clock = mutableClock('2026-10-15');
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ db, clock, corsOrigins: [] });
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

const getHome = (token: string) => app.inject({ method: 'GET', url: '/home', headers: bearer(token) });
const choose = (token: string, plantId: string) =>
  app.inject({ method: 'PUT', url: '/months/current/plant', headers: bearer(token), payload: { plantId } });

describe('GET /home', () => {
  it('식물을 고르지 않은 새 달', async () => {
    const { token } = await signupUser(app);
    const response = await getHome(token);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      today: '2026-10-15',
      month: '2026-10',
      plant: null,
      selectionLocked: false,
      writtenDays: 0,
      totalDays: 31,
      growthPercent: 0,
      growthStage: 1,
      fullyGrown: false,
      todayDiary: false,
    });
  });

  it('이번 달 기록 행을 만든다', async () => {
    const { token, userId } = await signupUser(app);
    await getHome(token);
    const rows = await db.select().from(monthlyRecords).where(eq(monthlyRecords.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ month: '2026-10-01', totalDays: 31, selectionLocked: false, plantId: null });
  });

  it.each([
    ['2026-02-10', 28],
    ['2028-02-10', 29],
    ['2026-09-10', 30],
    ['2026-10-10', 31],
  ])('%s의 달은 %i일', async (today, totalDays) => {
    clock.set(today);
    const { token } = await signupUser(app);
    expect((await getHome(token)).json().totalDays).toBe(totalDays);
  });

  it('31일 달 24일 작성은 77.4%로 미완성, 25일은 80.6%로 완전 성장', async () => {
    clock.set('2026-10-31');
    const { token, userId } = await signupUser(app);
    await insertDiaries(db, userId, datesInMonth('2026-10', 24));
    let home = (await getHome(token)).json();
    expect(home.writtenDays).toBe(24);
    expect(home.growthPercent).toBeCloseTo(77.419, 3);
    expect(home.growthStage).toBe(4);
    expect(home.fullyGrown).toBe(false);

    await insertDiaries(db, userId, ['2026-10-25']);
    home = (await getHome(token)).json();
    expect(home.growthPercent).toBeCloseTo(80.645, 3);
    expect(home.growthStage).toBe(5);
    expect(home.fullyGrown).toBe(true);
  });

  it('다른 달 일기는 세지 않고 오늘 일기 여부를 알려준다', async () => {
    const { token, userId } = await signupUser(app);
    await insertDiaries(db, userId, ['2026-09-30', '2026-11-01', '2026-10-15']);
    const home = (await getHome(token)).json();
    expect(home.writtenDays).toBe(1);
    expect(home.todayDiary).toBe(true);
  });

  it('달이 바뀌면 식물 선택이 비어 있는 새 달', async () => {
    const { token } = await signupUser(app);
    await choose(token, 'monstera');
    clock.set('2026-11-01');
    const home = (await getHome(token)).json();
    expect(home.month).toBe('2026-11');
    expect(home.plant).toBeNull();
    expect(home.totalDays).toBe(30);
  });
});

describe('GET /plants', () => {
  it('보유 여부는 사용자마다 따로 계산한다', async () => {
    const a = await signupUser(app, 'haru_01');
    const b = await signupUser(app, 'haru_02');
    await db.insert(userPlants).values({ userId: b.userId, plantId: 'hydrangea', unlockSource: 'ACHIEVEMENT' });
    const ofA = (await app.inject({ method: 'GET', url: '/plants', headers: bearer(a.token) })).json().plants;
    const ofB = (await app.inject({ method: 'GET', url: '/plants', headers: bearer(b.token) })).json().plants;
    expect(ofA.find((plant: { id: string }) => plant.id === 'hydrangea').owned).toBe(false);
    expect(ofB.find((plant: { id: string }) => plant.id === 'hydrangea').owned).toBe(true);
  });

  it('정렬 순서가 같으면 id 순', async () => {
    await db.update(plants).set({ sortOrder: 1 });
    const { token } = await signupUser(app);
    const ids = (await app.inject({ method: 'GET', url: '/plants', headers: bearer(token) })).json().plants.map((plant: { id: string }) => plant.id);
    expect(ids).toEqual([...ids].sort());
  });
  it('카탈로그를 순서대로, 보유 여부와 함께', async () => {
    const { token } = await signupUser(app);
    const response = await app.inject({ method: 'GET', url: '/plants', headers: bearer(token) });
    expect(response.statusCode).toBe(200);
    const { plants } = response.json();
    expect(plants.map((plant: { id: string }) => plant.id)).toEqual([
      'monstera', 'rose', 'sunflower', 'tulip', 'lavender', 'hydrangea', 'daisy', 'moonflower', 'anthurium',
    ]);
    expect(plants.filter((plant: { owned: boolean }) => plant.owned)).toHaveLength(5);
    expect(plants[7]).toMatchObject({ id: 'moonflower', catalogClass: 'LIMITED', coinPrice: 50, owned: false });
    expect(plants[0]).toMatchObject({ id: 'monstera', name: '몬스테라', kind: 'PLANT', catalogClass: 'STANDARD', coinPrice: null, owned: true });
  });
});

describe('PUT /months/current/plant', () => {
  it('비활성 식물은 404', async () => {
    const { token } = await signupUser(app);
    await db.update(plants).set({ isActive: false }).where(eq(plants.id, 'rose'));
    expect((await choose(token, 'rose')).statusCode).toBe(404);
  });
  it('보유한 식물을 고르면 홈에 반영되고, 잠기기 전에는 바꿀 수 있다', async () => {
    const { token } = await signupUser(app);
    expect((await choose(token, 'rose')).json().plant).toEqual({ id: 'rose', name: '장미', kind: 'FLOWER', catalogClass: 'STANDARD' });
    const response = await choose(token, 'tulip');
    expect(response.statusCode).toBe(200);
    expect(response.json().plant.id).toBe('tulip');
  });

  it('보유하지 않은 식물은 403', async () => {
    const { token } = await signupUser(app);
    const response = await choose(token, 'hydrangea');
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: { code: 'PLANT_NOT_OWNED', message: '보유한 식물만 고를 수 있어요.' } });
  });

  it('없는 식물은 404', async () => {
    const { token } = await signupUser(app);
    const response = await choose(token, 'nope');
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('PLANT_NOT_FOUND');
  });

  it('잠긴 달은 409', async () => {
    const { token, userId } = await signupUser(app);
    await choose(token, 'rose');
    await db
      .update(monthlyRecords)
      .set({ selectionLocked: true })
      .where(and(eq(monthlyRecords.userId, userId), eq(monthlyRecords.month, '2026-10-01')));
    const response = await choose(token, 'tulip');
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { code: 'SELECTION_LOCKED', message: '첫 일기를 쓴 달은 식물을 바꿀 수 없어요.' } });
  });

  it('입력이 비면 400', async () => {
    const { token } = await signupUser(app);
    const response = await choose(token, '');
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toBe('식물을 골라주세요.');
  });

  it('NUL 문자가 들어 있으면 400', async () => {
    const { token } = await signupUser(app);
    const response = await choose(token, 'a\u0000');
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('로그인하지 않으면 401', async () => {
    const response = await app.inject({ method: 'GET', url: '/home', headers: { 'x-client-platform': 'ios' } });
    expect(response.statusCode).toBe(401);
  });
});
