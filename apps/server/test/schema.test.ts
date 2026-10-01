import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  authEvents,
  coinTransactions,
  diaries,
  monthlyRecords,
  plants,
  sessions,
  userPlants,
  users,
} from '../src/db/schema';
import { seedCatalog } from '../src/db/seed';
import { createTestDb, expectPgError, resetDatabase } from './helpers';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDatabase(db);
  await seedCatalog(db);
});

async function createUser(loginId = 'haru_01') {
  const [user] = await db.insert(users).values({ loginId, nickname: '진화' }).returning();
  return user!;
}

describe('마이그레이션', () => {
  it('테이블 9개가 존재한다', async () => {
    const result = await db.execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name
    `);
    expect(result.rows.map((row) => row.table_name)).toEqual([
      'auth_events',
      'coin_transactions',
      'diaries',
      'monthly_records',
      'plants',
      'sessions',
      'user_credentials',
      'user_plants',
      'users',
    ]);
  });
});

describe('카탈로그 시드', () => {
  it('두 번 실행해도 9건이고 초기 무료는 5종', async () => {
    await seedCatalog(db);
    const all = await db.select().from(plants);
    expect(all).toHaveLength(9);
    expect(all.filter((plant) => plant.initialFree)).toHaveLength(5);
    expect(new Set(all.map((plant) => plant.catalogClass))).toEqual(new Set(['STANDARD', 'LIMITED', 'SPECIAL']));
  });

  it('STANDARD에 가격을 넣으면 거절', async () => {
    await expectPgError(
      db.insert(plants).values({ id: 'x', name: 'x', description: 'x', kind: 'PLANT', catalogClass: 'STANDARD', initialFree: false, coinPrice: 10, sortOrder: 99 }),
      '23514',
    );
  });

  it('LIMITED에 가격이 없으면 거절', async () => {
    await expectPgError(
      db.insert(plants).values({ id: 'y', name: 'y', description: 'y', kind: 'FLOWER', catalogClass: 'LIMITED', initialFree: false, coinPrice: null, sortOrder: 99 }),
      '23514',
    );
  });
});

describe('users 제약', () => {
  it('login_id 중복 거절', async () => {
    await createUser('same_id');
    await expectPgError(db.insert(users).values({ loginId: 'same_id', nickname: '다른사람' }), '23505');
  });

  it('login_id 형식(소문자·숫자·_ 3~30자) 위반 거절', async () => {
    await expectPgError(db.insert(users).values({ loginId: 'Upper', nickname: 'n' }), '23514');
    await expectPgError(db.insert(users).values({ loginId: 'ab', nickname: 'n' }), '23514');
  });

  it('코인 잔액은 0 미만 불가', async () => {
    const user = await createUser();
    await expectPgError(db.update(users).set({ coinBalance: -1 }).where(eq(users.id, user.id)), '23514');
  });
});

describe('coin_transactions 제약', () => {
  it('ADJUSTMENT는 양수만', async () => {
    const user = await createUser();
    await db.insert(coinTransactions).values({ userId: user.id, type: 'ADJUSTMENT', amount: 10, referenceKey: 'adj:1' });
    await expectPgError(
      db.insert(coinTransactions).values({ userId: user.id, type: 'ADJUSTMENT', amount: -10, referenceKey: 'adj:2' }),
      '23514',
    );
  });

  it('같은 날 출석은 한 번만', async () => {
    const user = await createUser();
    await db.insert(coinTransactions).values({ userId: user.id, type: 'ATTENDANCE', amount: 5, referenceKey: '2026-09-30' });
    await expectPgError(
      db.insert(coinTransactions).values({ userId: user.id, type: 'ATTENDANCE', amount: 5, referenceKey: '2026-09-30' }),
      '23505',
    );
  });

  it('출석은 양수, 구매는 음수만', async () => {
    const user = await createUser();
    await expectPgError(
      db.insert(coinTransactions).values({ userId: user.id, type: 'ATTENDANCE', amount: -5, referenceKey: '2026-09-30' }),
      '23514',
    );
    await expectPgError(
      db.insert(coinTransactions).values({ userId: user.id, type: 'PURCHASE', amount: 50, referenceKey: 'moonflower' }),
      '23514',
    );
  });
});

describe('diaries · monthly_records 제약', () => {
  it('하루에 일기 하나', async () => {
    const user = await createUser();
    await db.insert(diaries).values({ userId: user.id, diaryDate: '2026-09-30', body: '오늘의 기록' });
    await expectPgError(db.insert(diaries).values({ userId: user.id, diaryDate: '2026-09-30', body: '또 쓰기' }), '23505');
  });

  it('공백뿐인 일기 거절', async () => {
    const user = await createUser();
    await expectPgError(db.insert(diaries).values({ userId: user.id, diaryDate: '2026-09-29', body: '   ' }), '23514');
  });

  it('month는 1일이어야 한다', async () => {
    const user = await createUser();
    await expectPgError(db.insert(monthlyRecords).values({ userId: user.id, month: '2026-09-15', totalDays: 30 }), '23514');
    await db.insert(monthlyRecords).values({ userId: user.id, month: '2026-09-01', totalDays: 30 });
  });
});

describe('회원 삭제 CASCADE', () => {
  it('사용자를 지우면 연결된 데이터가 모두 지워진다', async () => {
    const user = await createUser();
    await db.insert(sessions).values({ userId: user.id, tokenHash: 'a'.repeat(64), platform: 'ios', expiresAt: new Date(Date.now() + 86_400_000) });
    await db.insert(authEvents).values({ userId: user.id, loginId: user.loginId, event: 'SIGNUP', platform: 'ios' });
    await db.insert(authEvents).values({ userId: null, loginId: 'nobody', event: 'LOGIN_FAILED', platform: 'web' });
    await db.insert(userPlants).values({ userId: user.id, plantId: 'monstera', unlockSource: 'INITIAL' });
    await db.insert(diaries).values({ userId: user.id, diaryDate: '2026-09-30', body: '기록' });
    await db.insert(monthlyRecords).values({ userId: user.id, month: '2026-09-01', totalDays: 30, plantId: 'monstera' });
    await db.insert(coinTransactions).values({ userId: user.id, type: 'ATTENDANCE', amount: 5, referenceKey: '2026-09-30' });

    await db.delete(users).where(eq(users.id, user.id));

    expect(await db.select().from(sessions)).toHaveLength(0);
    expect(await db.select().from(userPlants)).toHaveLength(0);
    expect(await db.select().from(diaries)).toHaveLength(0);
    expect(await db.select().from(monthlyRecords)).toHaveLength(0);
    expect(await db.select().from(coinTransactions)).toHaveLength(0);
    const remaining = await db.select().from(authEvents);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.loginId).toBe('nobody');
  });
});
