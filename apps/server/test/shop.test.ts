import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { coinTransactions, userPlants, users } from '../src/db/schema';
import { seedCatalog } from '../src/db/seed';
import { grantCoins } from '../src/domain/coins';
import { bearer } from './auth-helpers';
import { fireConcurrently } from './concurrency';
import { createTestDb, resetDatabase } from './helpers';
import { mutableClock, signupUser } from './months-helpers';

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

const shop = async (token: string) => (await app.inject({ method: 'GET', url: '/shop', headers: bearer(token) })).json();
const buy = (token: string, plantId: string) =>
  app.inject({ method: 'POST', url: '/shop/purchase', headers: bearer(token), payload: { plantId } });
const balanceOf = async (userId: string) => (await db.select().from(users).where(eq(users.id, userId)))[0]!.coinBalance;

describe('GET /shop', () => {
  it('LIMITED·SPECIAL만, 가격·보유 여부·잔액과 함께', async () => {
    const { token } = await signupUser(app);
    await grantCoins(db, 'haru_01', 30);
    expect(await shop(token)).toEqual({
      coinBalance: 30,
      items: [
        { id: 'moonflower', name: '달빛 꽃', description: '밤하늘을 닮은 특별한 꽃', kind: 'FLOWER', catalogClass: 'LIMITED', coinPrice: 50, owned: false },
        { id: 'anthurium', name: '산호빛 안스리움', description: '정원에 더하는 따뜻한 색', kind: 'FLOWER', catalogClass: 'SPECIAL', coinPrice: 100, owned: false },
      ],
    });
  });
});

describe('POST /shop/purchase', () => {
  it('코인이 부족하면 409이고 아무것도 바뀌지 않는다', async () => {
    const { token, userId } = await signupUser(app);
    await grantCoins(db, 'haru_01', 49);
    const response = await buy(token, 'moonflower');
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { code: 'INSUFFICIENT_COINS', message: '코인이 부족해요.' } });
    expect(await balanceOf(userId)).toBe(49);
    expect(await db.select().from(userPlants).where(and(eq(userPlants.userId, userId), eq(userPlants.plantId, 'moonflower')))).toHaveLength(0);
  });

  it('구매하면 차감·보유·원장 기록, 상점에 보유 중으로 표시', async () => {
    const { token, userId } = await signupUser(app);
    await grantCoins(db, 'haru_01', 60);
    const response = await buy(token, 'moonflower');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      coinBalance: 10,
      plant: { id: 'moonflower', name: '달빛 꽃', kind: 'FLOWER', catalogClass: 'LIMITED' },
    });
    const [owned] = await db.select().from(userPlants).where(and(eq(userPlants.userId, userId), eq(userPlants.plantId, 'moonflower')));
    expect(owned!.unlockSource).toBe('SHOP');
    const purchases = await db.select().from(coinTransactions).where(and(eq(coinTransactions.userId, userId), eq(coinTransactions.type, 'PURCHASE')));
    expect(purchases).toEqual([expect.objectContaining({ amount: -50, referenceKey: 'moonflower' })]);
    expect((await shop(token)).items[0].owned).toBe(true);
  });

  it('산 식물을 이번 달 식물로 고를 수 있다', async () => {
    const { token } = await signupUser(app);
    await grantCoins(db, 'haru_01', 50);
    await buy(token, 'moonflower');
    const response = await app.inject({ method: 'PUT', url: '/months/current/plant', headers: bearer(token), payload: { plantId: 'moonflower' } });
    expect(response.statusCode).toBe(200);
    expect(response.json().plant.id).toBe('moonflower');
  });

  it('이미 가진 식물은 409', async () => {
    const { token } = await signupUser(app);
    await grantCoins(db, 'haru_01', 200);
    await buy(token, 'moonflower');
    const again = await buy(token, 'moonflower');
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: { code: 'ALREADY_OWNED', message: '이미 가진 식물이에요.' } });
  });

  it('STANDARD는 판매하지 않는다', async () => {
    const { token } = await signupUser(app);
    await grantCoins(db, 'haru_01', 200);
    const response = await buy(token, 'hydrangea');
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: 'NOT_FOR_SALE', message: '상점에서 파는 식물이 아니에요.' } });
  });

  it('없는 식물은 404', async () => {
    const { token } = await signupUser(app);
    expect((await buy(token, 'nope')).statusCode).toBe(404);
  });

  it('동시에 두 번 사도 한 번만 차감된다', async () => {
    const { token, userId } = await signupUser(app);
    await grantCoins(db, 'haru_01', 200);
    const results = await fireConcurrently(2, () => buy(token, 'moonflower'));
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 409]);
    expect(await balanceOf(userId)).toBe(150);
  });

  it('잔액이 딱 두 식물 값일 때 두 식물을 동시에 사면 둘 다 성공', async () => {
    const { token, userId } = await signupUser(app);
    await grantCoins(db, 'haru_01', 150);
    const results = await Promise.all([buy(token, 'moonflower'), buy(token, 'anthurium')]);
    expect(results.map((result) => result.statusCode)).toEqual([200, 200]);
    expect(await balanceOf(userId)).toBe(0);
  });
});
