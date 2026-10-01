import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { coinTransactions, users } from '../src/db/schema';
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
  app = await buildApp({ db, clock, corsOrigins: [], attendanceCoins: 5 });
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

const attend = (token: string) => app.inject({ method: 'POST', url: '/attendance', headers: bearer(token) });
const home = async (token: string) => (await app.inject({ method: 'GET', url: '/home', headers: bearer(token) })).json();

describe('POST /attendance', () => {
  it('하루 1회 코인을 주고 원장에 남긴다', async () => {
    const { token, userId } = await signupUser(app);
    expect((await home(token)).attendedToday).toBe(false);
    const response = await attend(token);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ coinBalance: 5, attendedToday: true, earned: 5 });
    const ledger = await db.select().from(coinTransactions).where(eq(coinTransactions.userId, userId));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ type: 'ATTENDANCE', amount: 5, referenceKey: '2026-10-15' });
    const snapshot = await home(token);
    expect(snapshot.coinBalance).toBe(5);
    expect(snapshot.attendedToday).toBe(true);
  });

  it('같은 날 두 번째는 409이고 잔액은 그대로', async () => {
    const { token } = await signupUser(app);
    await attend(token);
    const again = await attend(token);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: { code: 'ALREADY_ATTENDED', message: '오늘은 이미 출석했어요.' } });
    expect((await home(token)).coinBalance).toBe(5);
  });

  it('동시에 10번 눌러도 한 번만 지급', async () => {
    const { token, userId } = await signupUser(app);
    const results = await fireConcurrently(10, () => attend(token));
    expect(results.filter((result) => result.statusCode === 200)).toHaveLength(1);
    expect(results.filter((result) => result.statusCode === 409)).toHaveLength(9);
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(user!.coinBalance).toBe(5);
  });

  it('날짜가 바뀌면 다시 출석할 수 있다', async () => {
    const { token } = await signupUser(app);
    await attend(token);
    clock.set('2026-10-16');
    expect((await attend(token)).json().coinBalance).toBe(10);
  });

  it('일기 작성·삭제는 잔액을 바꾸지 않는다', async () => {
    const { token } = await signupUser(app);
    await attend(token);
    await app.inject({ method: 'PUT', url: '/months/current/plant', headers: bearer(token), payload: { plantId: 'rose' } });
    await app.inject({ method: 'POST', url: '/diaries', headers: bearer(token), payload: { body: '오늘' } });
    expect((await home(token)).coinBalance).toBe(5);
    await app.inject({ method: 'DELETE', url: '/diaries/2026-10-15', headers: bearer(token) });
    expect((await home(token)).coinBalance).toBe(5);
  });

  it('지급량은 설정값을 따른다', async () => {
    const custom = await buildApp({ db, clock, corsOrigins: [], attendanceCoins: 7 });
    try {
      const { token } = await signupUser(custom, 'haru_07');
      const response = await custom.inject({ method: 'POST', url: '/attendance', headers: bearer(token) });
      expect(response.json().earned).toBe(7);
    } finally {
      await custom.close();
    }
  });
});

describe('grantCoins', () => {
  it('지정한 양을 더하고 ADJUSTMENT로 남긴다', async () => {
    const { userId } = await signupUser(app);
    expect(await grantCoins(db, 'haru_01', 120)).toEqual({ coinBalance: 120 });
    const [entry] = await db.select().from(coinTransactions).where(eq(coinTransactions.userId, userId));
    expect(entry).toMatchObject({ type: 'ADJUSTMENT', amount: 120 });
    expect(entry!.referenceKey).toMatch(/^adj:[0-9a-f]{32}$/);
  });

  it('여러 번 지급할 수 있다', async () => {
    await signupUser(app);
    await grantCoins(db, 'haru_01', 10);
    expect(await grantCoins(db, 'haru_01', 15)).toEqual({ coinBalance: 25 });
  });

  it.each([0, -1, 1.5, 100_001])('잘못된 양 %s는 거절', async (amount) => {
    await signupUser(app);
    await expect(grantCoins(db, 'haru_01', amount)).rejects.toThrow('1~100,000');
  });

  it('없는 아이디는 거절', async () => {
    await expect(grantCoins(db, 'nobody_x', 10)).rejects.toThrow('nobody_x');
  });
});
