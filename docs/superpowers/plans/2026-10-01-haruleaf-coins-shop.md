# HaruLeaf 5단계 — 출석 코인·상점 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인한 사용자가 홈에서 하루 1회 출석 코인을 받고, 상점에서 코인으로 LIMITED/SPECIAL 식물을 사서 이번 달 식물로 고를 수 있게 한다.

**Architecture:** 서버는 `domain/coins.ts`(출석·개발용 지급)와 `domain/shop.ts`(목록·구매)에 트랜잭션 로직을 두고 보호 라우트로 노출한다. 코인 원장은 DB 유일 제약 `(user_id, type, reference_key)`와 사용자 행 `FOR UPDATE`로 중복을 막는다. 홈 응답에 잔액·출석 여부를 실어 앱이 그 값을 그대로 표시한다.

**Tech Stack:** Node 26, npm workspaces, TypeScript ~6.0.3, zod 4(shared 경유), Fastify 5, Drizzle 0.45 + pg, Vitest 5, Expo SDK 57 + Expo Router.

**설계 문서:** `docs/superpowers/specs/2026-10-01-haruleaf-coins-shop-design.md`

## Global Constraints

- 출석은 서버 `clock.today()` 기준 하루 1회. 지급량은 `AppDeps.attendanceCoins`(기본 5, 서버 실행 시 `ATTENDANCE_COINS` 환경변수).
- 원장 type: `ATTENDANCE`(amount > 0, reference_key = `YYYY-MM-DD`), `PURCHASE`(amount < 0, reference_key = plant_id), `ADJUSTMENT`(amount > 0, reference_key = `adj:` + 하이픈 없는 UUID 32자). 유일 제약 `coin_transactions_once_per_reference`.
- 잔액 `users.coin_balance >= 0` (DB CHECK 유지). 잔액 변경은 반드시 원장 기록과 같은 트랜잭션.
- 오류: 409 `ALREADY_ATTENDED` "오늘은 이미 출석했어요." / 404 `PLANT_NOT_FOUND` "식물을 찾을 수 없어요." / 400 `NOT_FOR_SALE` "상점에서 파는 식물이 아니에요." / 409 `ALREADY_OWNED` "이미 가진 식물이에요." / 409 `INSUFFICIENT_COINS` "코인이 부족해요."
- 상점 판매 대상 = `catalog_class IN ('LIMITED','SPECIAL') AND is_active`.
- 개발용 지급은 CLI 전용(HTTP 라우트 금지).
- 서버·앱은 zod를 `@haruleaf/shared`로만 쓴다. 로그에 비밀번호·토큰·일기 본문·DB message 금지.
- 앱 탭 화면은 이동 후에도 마운트되어 있으므로, 모달·메시지 상태가 있는 화면은 `useIsFocused()`로 포커스 중일 때만 내용을 렌더링한다.
- 커밋 메시지는 한국어, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Docker DB(`npm run db:up`, 5433) 필요.

## 파일 구조

```
apps/server/src/
  db/client.ts            (수정) Tx, Executor 타입 export
  db/schema.ts            (수정) amount_sign CHECK에 ADJUSTMENT
  db/migrations/0001_coin_adjustment.sql (생성물)
  domain/accounts.ts      (수정) Tx/Executor import
  domain/months.ts        (수정) Tx/Executor import, listPlants 정렬, homeFor(today), getHome 확장
  domain/coins.ts         (신규) attend, grantCoins
  domain/shop.ts          (신규) listShop, purchase
  routes/coins.ts         (신규) POST /attendance
  routes/shop.ts          (신규) GET /shop, POST /shop/purchase
  routes/protected.ts     (수정) ProtectedDeps에 attendanceCoins
  app.ts, server.ts       (수정) attendanceCoins 전달, 라우트 등록
  scripts/grant-coins.ts  (신규) CLI
apps/server/test/
  concurrency.ts (신규 도우미), protected.test.ts·home.test.ts·diaries.test.ts (추가), coins.test.ts, shop.test.ts (신규)
packages/shared/src/
  coins.ts (신규) AttendanceResponse, ShopItem, ShopResponse, purchaseSchema, PurchaseInput, PurchaseResponse
  diary.ts (수정) HomeResponse에 coinBalance·attendedToday
  index.ts (수정)
apps/app/src/
  api/coins.ts (신규), components/AttendanceCard.tsx (신규)
  app/(main)/index.tsx (수정), app/(main)/shop.tsx (교체)
package.json (루트, 수정) dev:grant-coins
```

---

### Task 1: 서버 선행 정리와 테스트 기반

**Files:**
- Modify: `apps/server/src/db/client.ts`, `domain/accounts.ts`, `domain/months.ts`
- Create: `apps/server/test/concurrency.ts`
- Test: `apps/server/test/protected.test.ts`, `home.test.ts`, `diaries.test.ts` (추가)

**Interfaces:**
- Produces: `export type Tx`, `export type Executor` (`db/client.ts`); `homeFor(db, userId, today: string): Promise<HomeResponse>` (months.ts, getHome은 `homeFor(db, userId, clock.today())`); `fireConcurrently<T>(count: number, fn: () => Promise<T>): Promise<T[]>`

- [ ] **Step 1: 동시 요청 도우미** — `apps/server/test/concurrency.ts`

```ts
/** 같은 요청을 동시에 count번 보낸다(모두 시작한 뒤 한꺼번에 기다림). */
export function fireConcurrently<T>(count: number, fn: () => Promise<T>): Promise<T[]> {
  return Promise.all(Array.from({ length: count }, () => fn()));
}
```

- [ ] **Step 2: 실패하는 테스트 추가**

`apps/server/test/protected.test.ts`의 `describe('보호 라우트', …)` 안에 추가:

```ts
  it.each([
    ['GET', '/me'],
    ['PATCH', '/me'],
    ['DELETE', '/me'],
    ['POST', '/auth/logout'],
    ['GET', '/home'],
    ['GET', '/plants'],
    ['PUT', '/months/current/plant'],
    ['GET', '/diaries'],
    ['POST', '/diaries'],
    ['GET', '/diaries/2026-10-15'],
    ['PUT', '/diaries/2026-10-15'],
    ['DELETE', '/diaries/2026-10-15'],
  ] as const)('%s %s 는 토큰 없이 401', async (method, url) => {
    const response = await app.inject({ method, url, headers: IOS });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });

  it('공개 라우트는 토큰 없이 열려 있다', async () => {
    expect((await app.inject({ method: 'GET', url: '/health', headers: IOS })).statusCode).toBe(200);
    const login = await app.inject({ method: 'POST', url: '/auth/login', headers: IOS, payload: { loginId: 'nobody', password: 'x' } });
    expect(login.statusCode).toBe(401);
    expect(login.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('CORS 사전 요청은 인증하지 않는다', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/home',
      headers: { origin: 'http://localhost:8081', 'access-control-request-method': 'GET' },
    });
    expect(response.statusCode).not.toBe(401);
  });
```

(`buildApp` 호출의 `corsOrigins`가 `[]`이면 CORS 테스트를 위해 `['http://localhost:8081']`로 바꾼다.)

`apps/server/test/home.test.ts`의 `describe('GET /plants', …)` 안에 추가:

```ts
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
```

같은 파일 `describe('PUT /months/current/plant', …)` 안에 추가:

```ts
  it('비활성 식물은 404', async () => {
    const { token } = await signupUser(app);
    await db.update(plants).set({ isActive: false }).where(eq(plants.id, 'rose'));
    expect((await choose(token, 'rose')).statusCode).toBe(404);
  });
```

(import에 `plants`, `userPlants`를 `../src/db/schema`에서 추가)

`apps/server/test/diaries.test.ts`의 `describe('POST /diaries', …)` 안에 추가(import `fireConcurrently` from `./concurrency`):

```ts
  it('같은 날 동시에 5번 써도 1편만 저장된다', async () => {
    const { token } = await readyUser();
    const results = await fireConcurrently(5, () => write(token, { body: '동시' }));
    expect(results.map((result) => result.statusCode).sort()).toEqual([201, 409, 409, 409, 409]);
    expect(await db.select().from(diaries)).toHaveLength(1);
  });
```

- [ ] **Step 3: 실패 확인**

Run: `cd ~/HaruLeaf && npm run db:up && npm test -w @haruleaf/server`
Expected: "정렬 순서가 같으면 id 순"이 FAIL(정렬이 sort_order만), 나머지 새 테스트는 PASS 가능(이미 올바른 동작을 고정하는 회귀 테스트). 실제 결과를 보고서에 기록.

- [ ] **Step 4: 구현**

`apps/server/src/db/client.ts`에 추가:

```ts
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Executor = Db | Tx;
```

`apps/server/src/domain/accounts.ts`: 로컬 `type Tx`, `type Executor` 정의를 지우고 `import type { Db, Executor } from '../db/client';`로 바꾼다(`Tx`를 쓰면 함께 import).

`apps/server/src/domain/months.ts`:
- `export type Tx …`, `export type Executor …` 정의를 지우고 `import type { Db, Executor, Tx } from '../db/client';` 및 `export type { Executor, Tx } from '../db/client';`(기존 import 경로 호환).
- `listPlants`의 `.orderBy(asc(plants.sortOrder))` → `.orderBy(asc(plants.sortOrder), asc(plants.id))`.
- `getHome`을 아래로 교체:

```ts
export async function homeFor(db: Db, userId: string, today: string): Promise<HomeResponse> {
  const monthStart = monthStartOf(today);
  await ensureMonth(db, userId, monthStart);
  const snapshot = await monthSnapshot(db, userId, monthStart);
  const [todayRow] = await db
    .select({ date: diaries.diaryDate })
    .from(diaries)
    .where(and(eq(diaries.userId, userId), eq(diaries.diaryDate, today)))
    .limit(1);
  return { ...snapshot, today, todayDiary: Boolean(todayRow) };
}

export function getHome(db: Db, userId: string, clock: Clock): Promise<HomeResponse> {
  return homeFor(db, userId, clock.today());
}
```

- `selectPlant`: 첫 줄을 `const today = clock.today(); const monthStart = monthStartOf(today);`로, 마지막 `return getHome(db, userId, clock);`을 `return homeFor(db, userId, today);`로.

- [ ] **Step 5: 통과 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server && npm run typecheck -w @haruleaf/server`
Expected: 전체 PASS, 타입 오류 0.

- [ ] **Step 6: 커밋**

```bash
cd ~/HaruLeaf
git add apps/server
git commit -m "refactor: 트랜잭션 타입 공용화, 식물 목록 정렬 보완, 식물 선택 날짜 한 번만 읽기, 보호 라우트·동시 요청 테스트 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 출석 코인 API와 홈 잔액·출석 여부

**Files:**
- Modify: `apps/server/src/db/schema.ts`; Create (생성물): `apps/server/src/db/migrations/0001_coin_adjustment.sql`
- Create: `packages/shared/src/coins.ts`; Modify: `packages/shared/src/diary.ts`, `index.ts`
- Create: `apps/server/src/domain/coins.ts`, `apps/server/src/routes/coins.ts`
- Modify: `apps/server/src/domain/months.ts`, `routes/protected.ts`, `app.ts`, `server.ts`
- Test: `apps/server/test/coins.test.ts` (신규), `home.test.ts` (기존 toEqual 갱신), `schema.test.ts` (추가)

**Interfaces:**
- Consumes: Task 1 `Executor`, `homeFor`, `fireConcurrently`; `isUniqueViolation`
- Produces:
  - shared `AttendanceResponse = { coinBalance: number; attendedToday: true; earned: number }`; `HomeResponse`에 `coinBalance: number`, `attendedToday: boolean` 추가
  - `ProtectedDeps = { db; clock; attendanceCoins: number }`, `AppDeps.attendanceCoins?: number`(기본 5)
  - `attend(db, userId, today, coins): Promise<AttendanceResponse>`
  - `grantCoins(db, loginId, amount): Promise<{ coinBalance: number }>` (Task 4가 CLI로 감쌈)
  - `coinRoutes: ProtectedPlugin` — `POST /attendance`

- [ ] **Step 1: 공용 타입** — `packages/shared/src/coins.ts`

```ts
export type AttendanceResponse = { coinBalance: number; attendedToday: true; earned: number };
```

`packages/shared/src/diary.ts`의 `HomeResponse`를 교체:

```ts
export type HomeResponse = MonthSnapshot & {
  today: string;
  todayDiary: boolean;
  coinBalance: number;
  attendedToday: boolean;
};
```

`packages/shared/src/index.ts`에 `export * from './coins';` 추가.

- [ ] **Step 2: 실패하는 테스트 작성** — `apps/server/test/coins.test.ts`

```ts
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
```

`apps/server/test/home.test.ts`의 첫 테스트 `toEqual({...})`에 `coinBalance: 0, attendedToday: false`를 추가한다.

`apps/server/test/schema.test.ts`의 `describe('coin_transactions 제약', …)` 안에 추가:

```ts
  it('ADJUSTMENT는 양수만', async () => {
    const user = await createUser();
    await db.insert(coinTransactions).values({ userId: user.id, type: 'ADJUSTMENT', amount: 10, referenceKey: 'adj:1' });
    await expectPgError(
      db.insert(coinTransactions).values({ userId: user.id, type: 'ADJUSTMENT', amount: -10, referenceKey: 'adj:2' }),
      '23514',
    );
  });
```

- [ ] **Step 3: 실패 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server`
Expected: FAIL — `/attendance` 404, `grantCoins` 없음, 홈에 `coinBalance` 없음, ADJUSTMENT CHECK 위반.

- [ ] **Step 4: 스키마·마이그레이션**

`apps/server/src/db/schema.ts`의 `coin_transactions_amount_sign`을:

```ts
    check(
      'coin_transactions_amount_sign',
      sql`(${t.type} = 'ATTENDANCE' and ${t.amount} > 0) or (${t.type} = 'PURCHASE' and ${t.amount} < 0) or (${t.type} = 'ADJUSTMENT' and ${t.amount} > 0)`,
    ),
```

Run: `cd ~/HaruLeaf && npm run db:generate -- --name coin_adjustment && cat apps/server/src/db/migrations/0001_coin_adjustment.sql && npm run db:migrate`
Expected: SQL에 기존 CHECK 삭제 후 새 CHECK 추가가 들어 있고, 개발 DB에 적용된다(테스트 DB는 vitest global-setup이 적용).

- [ ] **Step 5: 구현**

`apps/server/src/domain/coins.ts`:

```ts
import type { AttendanceResponse } from '@haruleaf/shared';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { coinTransactions, users } from '../db/schema';
import { isUniqueViolation } from '../lib/db-errors';
import { AppError } from '../lib/errors';

const MAX_GRANT = 100_000;

/** 서버 기준 오늘 출석. 원장 기록과 잔액 증가를 한 트랜잭션에서 처리한다. */
export async function attend(db: Db, userId: string, today: string, coins: number): Promise<AttendanceResponse> {
  try {
    return await db.transaction(async (tx) => {
      await tx.insert(coinTransactions).values({ userId, type: 'ATTENDANCE', amount: coins, referenceKey: today });
      const [row] = await tx
        .update(users)
        .set({ coinBalance: sql`${users.coinBalance} + ${coins}` })
        .where(eq(users.id, userId))
        .returning({ coinBalance: users.coinBalance });
      if (!row) throw new Error('사용자를 찾을 수 없습니다.');
      return { coinBalance: row.coinBalance, attendedToday: true, earned: coins };
    });
  } catch (error) {
    if (isUniqueViolation(error, 'coin_transactions_once_per_reference')) {
      throw new AppError('ALREADY_ATTENDED', '오늘은 이미 출석했어요.', 409);
    }
    throw error;
  }
}

/** 개발·시연용 코인 지급(CLI 전용). */
export async function grantCoins(db: Db, loginId: string, amount: number): Promise<{ coinBalance: number }> {
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_GRANT) {
    throw new Error('지급할 코인은 1~100,000 사이의 정수여야 합니다.');
  }
  return db.transaction(async (tx) => {
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.loginId, loginId)).limit(1);
    if (!user) throw new Error(`아이디를 찾을 수 없습니다: ${loginId}`);
    await tx.insert(coinTransactions).values({
      userId: user.id,
      type: 'ADJUSTMENT',
      amount,
      referenceKey: `adj:${randomUUID().replaceAll('-', '')}`,
    });
    const [row] = await tx
      .update(users)
      .set({ coinBalance: sql`${users.coinBalance} + ${amount}` })
      .where(eq(users.id, user.id))
      .returning({ coinBalance: users.coinBalance });
    return { coinBalance: row!.coinBalance };
  });
}
```

`apps/server/src/domain/months.ts`의 `homeFor`: `return` 직전에 잔액·출석 조회를 추가하고 반환값에 포함:

```ts
  const [account] = await db.select({ coinBalance: users.coinBalance }).from(users).where(eq(users.id, userId)).limit(1);
  const [attendance] = await db
    .select({ id: coinTransactions.id })
    .from(coinTransactions)
    .where(and(eq(coinTransactions.userId, userId), eq(coinTransactions.type, 'ATTENDANCE'), eq(coinTransactions.referenceKey, today)))
    .limit(1);
  return {
    ...snapshot,
    today,
    todayDiary: Boolean(todayRow),
    coinBalance: account?.coinBalance ?? 0,
    attendedToday: Boolean(attendance),
  };
```

(import에 `coinTransactions`, `users` 추가)

`apps/server/src/routes/protected.ts`: `export type ProtectedDeps = { db: Db; clock: Clock; attendanceCoins: number };`

`apps/server/src/routes/coins.ts`:

```ts
import type { AttendanceResponse } from '@haruleaf/shared';
import { attend } from '../domain/coins';
import { authOf } from '../plugins/auth';
import type { ProtectedPlugin } from './protected';

export const coinRoutes: ProtectedPlugin = async (app, { db, clock, attendanceCoins }) => {
  app.post('/attendance', async (request): Promise<AttendanceResponse> =>
    attend(db, authOf(request).userId, clock.today(), attendanceCoins),
  );
};
```

`apps/server/src/app.ts`:
- `AppDeps`에 `attendanceCoins?: number;` 추가.
- `import { coinRoutes } from './routes/coins';`
- 보호 라우트 등록을 `await app.register(protectedRoutes([logoutRoutes, meRoutes, homeRoutes, diaryRoutes, coinRoutes]), { db: deps.db, clock: deps.clock, attendanceCoins: deps.attendanceCoins ?? 5 });`

`apps/server/src/server.ts`: `buildApp({ … })` 인자에 `attendanceCoins: config.attendanceCoins,` 추가.

`apps/server/test/protected.test.ts`의 401 표에 `['POST', '/attendance'],` 추가.

- [ ] **Step 6: 통과 확인**

Run: `cd ~/HaruLeaf && npm test && npm run typecheck`
Expected: 전체 PASS(shared·server·scripts), 타입 오류 0. (앱 타입체크에서 `HomeResponse` 필드 추가로 깨지는 곳이 없어야 함.)

- [ ] **Step 7: 커밋**

```bash
cd ~/HaruLeaf
git add apps/server packages/shared
git commit -m "feat: 출석 코인 API와 홈 잔액·출석 여부 추가, 원장에 개발용 지급(ADJUSTMENT) 유형 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 상점 목록·구매 API

**Files:**
- Modify: `packages/shared/src/coins.ts`
- Create: `apps/server/src/domain/shop.ts`, `apps/server/src/routes/shop.ts`
- Modify: `apps/server/src/app.ts`
- Test: `apps/server/test/shop.test.ts`, `protected.test.ts`(표에 추가)

**Interfaces:**
- Consumes: Task 2 `grantCoins`, `ProtectedDeps`; Task 1 `fireConcurrently`
- Produces:
  - shared `ShopItem = { id; name; description; kind: PlantKind; catalogClass: 'LIMITED' | 'SPECIAL'; coinPrice: number; owned: boolean }`, `ShopResponse = { coinBalance: number; items: ShopItem[] }`, `purchaseSchema`(= `{ plantId }`, `selectPlantSchema`와 같은 규칙), `PurchaseInput`, `PurchaseResponse = { coinBalance: number; plant: PlantSummary }`
  - `listShop(db, userId): Promise<ShopResponse>`, `purchase(db, userId, plantId): Promise<PurchaseResponse>`
  - `shopRoutes: ProtectedPlugin` — `GET /shop`, `POST /shop/purchase`

- [ ] **Step 1: 공용 타입** — `packages/shared/src/coins.ts`에 추가

```ts
import type { z } from 'zod';
import { selectPlantSchema, type PlantKind, type PlantSummary } from './diary';

export type ShopItem = {
  id: string;
  name: string;
  description: string;
  kind: PlantKind;
  catalogClass: 'LIMITED' | 'SPECIAL';
  coinPrice: number;
  owned: boolean;
};
export type ShopResponse = { coinBalance: number; items: ShopItem[] };

export const purchaseSchema = selectPlantSchema;
export type PurchaseInput = z.infer<typeof purchaseSchema>;
export type PurchaseResponse = { coinBalance: number; plant: PlantSummary };
```

- [ ] **Step 2: 실패하는 테스트 작성** — `apps/server/test/shop.test.ts`

```ts
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
```

`apps/server/test/protected.test.ts` 401 표에 `['GET', '/shop'],`, `['POST', '/shop/purchase'],` 추가.

- [ ] **Step 3: 실패 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server -- test/shop.test.ts`
Expected: FAIL — `/shop` 404.

- [ ] **Step 4: 구현**

`apps/server/src/domain/shop.ts`:

```ts
import type { PlantSummary, PurchaseResponse, ShopItem, ShopResponse } from '@haruleaf/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { coinTransactions, plants, userPlants, users } from '../db/schema';
import { AppError } from '../lib/errors';

const FOR_SALE = ['LIMITED', 'SPECIAL'] as const;

export async function listShop(db: Db, userId: string): Promise<ShopResponse> {
  const [account] = await db.select({ coinBalance: users.coinBalance }).from(users).where(eq(users.id, userId)).limit(1);
  const rows = await db
    .select({
      id: plants.id,
      name: plants.name,
      description: plants.description,
      kind: plants.kind,
      catalogClass: plants.catalogClass,
      coinPrice: plants.coinPrice,
      ownerId: userPlants.userId,
    })
    .from(plants)
    .leftJoin(userPlants, and(eq(userPlants.plantId, plants.id), eq(userPlants.userId, userId)))
    .where(and(eq(plants.isActive, true), inArray(plants.catalogClass, [...FOR_SALE])))
    .orderBy(asc(plants.sortOrder), asc(plants.id));
  const items: ShopItem[] = rows.map(({ ownerId, ...plant }) => ({
    ...plant,
    kind: plant.kind as ShopItem['kind'],
    catalogClass: plant.catalogClass as ShopItem['catalogClass'],
    coinPrice: plant.coinPrice ?? 0,
    owned: ownerId !== null,
  }));
  return { coinBalance: account?.coinBalance ?? 0, items };
}

/** 사용자 행을 잠근 뒤 판매 대상·미보유·잔액을 확인하고, 원장·잔액·보유를 한 트랜잭션에서 바꾼다. */
export async function purchase(db: Db, userId: string, plantId: string): Promise<PurchaseResponse> {
  return db.transaction(async (tx) => {
    const [account] = await tx
      .select({ coinBalance: users.coinBalance })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');
    if (!account) throw new AppError('UNAUTHORIZED', '다시 로그인해주세요.', 401);
    const [plant] = await tx
      .select({ id: plants.id, name: plants.name, kind: plants.kind, catalogClass: plants.catalogClass, coinPrice: plants.coinPrice })
      .from(plants)
      .where(and(eq(plants.id, plantId), eq(plants.isActive, true)))
      .limit(1);
    if (!plant) throw new AppError('PLANT_NOT_FOUND', '식물을 찾을 수 없어요.', 404);
    if (!FOR_SALE.includes(plant.catalogClass as (typeof FOR_SALE)[number]) || plant.coinPrice === null) {
      throw new AppError('NOT_FOR_SALE', '상점에서 파는 식물이 아니에요.', 400);
    }
    const [owned] = await tx
      .select({ plantId: userPlants.plantId })
      .from(userPlants)
      .where(and(eq(userPlants.userId, userId), eq(userPlants.plantId, plantId)))
      .limit(1);
    if (owned) throw new AppError('ALREADY_OWNED', '이미 가진 식물이에요.', 409);
    if (account.coinBalance < plant.coinPrice) throw new AppError('INSUFFICIENT_COINS', '코인이 부족해요.', 409);

    await tx.insert(coinTransactions).values({ userId, type: 'PURCHASE', amount: -plant.coinPrice, referenceKey: plant.id });
    const [updated] = await tx
      .update(users)
      .set({ coinBalance: sql`${users.coinBalance} - ${plant.coinPrice}` })
      .where(eq(users.id, userId))
      .returning({ coinBalance: users.coinBalance });
    await tx.insert(userPlants).values({ userId, plantId: plant.id, unlockSource: 'SHOP' });
    const summary: PlantSummary = {
      id: plant.id,
      name: plant.name,
      kind: plant.kind as PlantSummary['kind'],
      catalogClass: plant.catalogClass as PlantSummary['catalogClass'],
    };
    return { coinBalance: updated!.coinBalance, plant: summary };
  });
}
```

`apps/server/src/routes/shop.ts`:

```ts
import { purchaseSchema, type PurchaseResponse, type ShopResponse } from '@haruleaf/shared';
import { listShop, purchase } from '../domain/shop';
import { authOf } from '../plugins/auth';
import type { ProtectedPlugin } from './protected';

export const shopRoutes: ProtectedPlugin = async (app, { db }) => {
  app.get('/shop', async (request): Promise<ShopResponse> => listShop(db, authOf(request).userId));

  app.post('/shop/purchase', async (request): Promise<PurchaseResponse> => {
    const { plantId } = purchaseSchema.parse(request.body);
    return purchase(db, authOf(request).userId, plantId);
  });
};
```

`apps/server/src/app.ts`: `import { shopRoutes } from './routes/shop';` 추가, 보호 라우트 목록 끝에 `shopRoutes`.

- [ ] **Step 5: 통과 확인**

Run: `cd ~/HaruLeaf && npm test && npm run typecheck`
Expected: 전체 PASS, 타입 오류 0.

- [ ] **Step 6: 커밋**

```bash
cd ~/HaruLeaf
git add apps/server packages/shared
git commit -m "feat: 상점 목록·구매 API 추가 — 사용자 행 잠금으로 잔액 확인·차감·보유 추가를 한 번에 처리

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 개발용 코인 지급 명령

**Files:**
- Create: `apps/server/src/scripts/grant-coins.ts`
- Modify: `apps/server/package.json`, 루트 `package.json`, `README.md`

**Interfaces:**
- Consumes: Task 2 `grantCoins(db, loginId, amount)`; `loadRootEnv`, `loadConfig`, `createDb`

- [ ] **Step 1: CLI 작성** — `apps/server/src/scripts/grant-coins.ts`

```ts
// 개발·시연 전용: 특정 계정에 코인을 넣는다. HTTP로는 노출하지 않는다.
// 사용법: npm run dev:grant-coins -- <아이디> <양>
import { loadConfig, loadRootEnv } from '../config';
import { createDb } from '../db/client';
import { grantCoins } from '../domain/coins';

loadRootEnv();
const [loginId, amountText] = process.argv.slice(2);
if (!loginId || !amountText) {
  console.error('사용법: npm run dev:grant-coins -- <아이디> <양>');
  process.exit(1);
}
const amount = Number(amountText);
const { db, pool } = createDb(loadConfig().databaseUrl);
try {
  const { coinBalance } = await grantCoins(db, loginId.trim().toLowerCase(), amount);
  console.log(`${loginId}에게 ${amount}코인을 넣었습니다. 현재 잔액: ${coinBalance}코인`);
} catch (error) {
  console.error(error instanceof Error ? error.message : '코인을 넣지 못했습니다.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
```

`apps/server/package.json`의 `scripts`에 `"grant-coins": "tsx src/scripts/grant-coins.ts"` 추가.
루트 `package.json`의 `scripts`에 `"dev:grant-coins": "npm run grant-coins -w @haruleaf/server --"` 추가.

`README.md`의 "DB 관리" 아래에 추가:

```markdown
### 시연용 코인 넣기

출석은 하루 5코인이라 상점 구매(50·100코인)를 바로 보여주기 어렵다. 개발·시연 중에는 아래 명령으로 계정에 코인을 넣는다(원장에 `ADJUSTMENT`로 기록).

    npm run dev:grant-coins -- <아이디> 100
```

- [ ] **Step 2: 동작 확인**

Run:
```bash
cd ~/HaruLeaf
npm run db:migrate
npm run dev:grant-coins -- nobody_x 10; echo "exit=$?"
npm run dev:grant-coins -- ; echo "exit=$?"
```
Expected: 첫 줄 "아이디를 찾을 수 없습니다: nobody_x", exit=1. 둘째 줄 사용법 안내, exit=1.
가능하면 개발 DB에 있는 테스트 계정 하나(예: `cross_t4`)로 `npm run dev:grant-coins -- cross_t4 5`를 실행해 "현재 잔액"이 출력되는지도 확인한다(없으면 생략하고 보고서에 기록).

- [ ] **Step 3: 타입체크와 커밋**

Run: `cd ~/HaruLeaf && npm run typecheck -w @haruleaf/server`

```bash
cd ~/HaruLeaf
git add apps/server package.json README.md
git commit -m "feat: 시연용 코인 지급 명령(dev:grant-coins) 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 앱 — 홈 잔액·출석 버튼

**Files:**
- Create: `apps/app/src/api/coins.ts`, `apps/app/src/components/AttendanceCard.tsx`
- Modify: `apps/app/src/app/(main)/index.tsx`

**Interfaces:**
- Consumes: shared `AttendanceResponse`, `HomeResponse`(coinBalance, attendedToday), `ShopResponse`, `PurchaseInput`, `PurchaseResponse`
- Produces: `attendRequest()`, `fetchShop()`, `purchaseRequest(input)` (`api/coins.ts`); `<AttendanceCard coinBalance attendedToday onAttended />`

- [ ] **Step 1: API 함수** — `apps/app/src/api/coins.ts`

```ts
import type { AttendanceResponse, PurchaseInput, PurchaseResponse, ShopResponse } from '@haruleaf/shared';
import { apiRequest } from './client';

export const attendRequest = () => apiRequest<AttendanceResponse>('/attendance', { method: 'POST' });

export const fetchShop = () => apiRequest<ShopResponse>('/shop');

export const purchaseRequest = (input: PurchaseInput) =>
  apiRequest<PurchaseResponse>('/shop/purchase', { method: 'POST', body: input });
```

- [ ] **Step 2: 출석 카드** — `apps/app/src/components/AttendanceCard.tsx`

```tsx
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '@/api/client';
import { attendRequest } from '@/api/coins';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';
import { Button } from './Button';
import { FormMessage } from './FormMessage';

type Props = { coinBalance: number; attendedToday: boolean; onAttended: () => void };

/** 홈 잔액과 오늘 출석 버튼(FR-13·14·20). 결과는 onAttended로 홈을 다시 불러와 반영한다. */
export function AttendanceCard({ coinBalance, attendedToday, onAttended }: Props) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function attend() {
    if (pending || attendedToday) return;
    setPending(true);
    setMessage(null);
    try {
      await attendRequest();
    } catch (error) {
      if (!(error instanceof ApiError && error.code === 'ALREADY_ATTENDED')) {
        setMessage(error instanceof ApiError ? error.message : '출석하지 못했어요.');
      }
    } finally {
      setPending(false);
      onAttended();
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.balance} accessibilityLabel={`보유 코인 ${coinBalance}코인`}>
          🪙 {coinBalance.toLocaleString('ko-KR')}코인
        </Text>
        <View style={styles.action}>
          <Button
            title={attendedToday ? '오늘 출석 완료' : '출석하기'}
            variant={attendedToday ? 'secondary' : 'primary'}
            onPress={() => void attend()}
            loading={pending}
            disabled={attendedToday}
          />
        </View>
      </View>
      {message && <FormMessage tone="error" message={message} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  balance: { fontSize: fontSize.heading, fontWeight: '700', color: colors.text },
  action: { minWidth: 140 },
});
```

- [ ] **Step 3: 홈에 배치** — `apps/app/src/app/(main)/index.tsx`

import에 `import { AttendanceCard } from '@/components/AttendanceCard';` 추가하고, `{state.status === 'ready' && <HomeBody home={state.data} />}` 줄을 다음으로 교체:

```tsx
      {state.status === 'ready' && (
        <>
          <AttendanceCard
            coinBalance={state.data.coinBalance}
            attendedToday={state.data.attendedToday}
            onAttended={reload}
          />
          <HomeBody home={state.data} />
        </>
      )}
```

- [ ] **Step 4: 검증**

Run: `cd ~/HaruLeaf && npm run typecheck && npm run lint`
Expected: 오류 0.

Web 확인(이미 떠 있는 개발 서버 :4000/:8081 사용, 새로 띄우거나 끄지 말 것): 새 계정 가입 → 홈에 "🪙 0코인"·[출석하기] → 누르면 "🪙 5코인"·"오늘 출석 완료"(비활성) → 새로고침해도 유지. 콘솔 오류 0.

- [ ] **Step 5: 커밋**

```bash
cd ~/HaruLeaf
git add apps/app
git commit -m "feat: 홈에 코인 잔액과 출석 버튼 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 앱 — 상점 화면

**Files:**
- Modify (교체): `apps/app/src/app/(main)/shop.tsx`

**Interfaces:**
- Consumes: Task 5 `fetchShop`, `purchaseRequest`; `useRemoteData`, `PlantImage`, `Button`, `FormMessage`, `ConfirmModal`, `Screen`; expo-router `useIsFocused`, `router`

- [ ] **Step 1: 상점 화면** — `apps/app/src/app/(main)/shop.tsx`

```tsx
import type { ShopItem } from '@haruleaf/shared';
import { router, useIsFocused } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '@/api/client';
import { fetchShop, purchaseRequest } from '@/api/coins';
import { Button } from '@/components/Button';
import { ConfirmModal } from '@/components/ConfirmModal';
import { FormMessage } from '@/components/FormMessage';
import { PlantImage } from '@/components/PlantImage';
import { Screen } from '@/components/Screen';
import { useRemoteData } from '@/hooks/useRemoteData';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

export default function ShopScreen() {
  // 탭 화면은 이동 후에도 남아 있으므로, 다시 들어올 때마다 안내·확인 창을 새로 시작한다.
  const isFocused = useIsFocused();
  return isFocused ? <ShopContent /> : null;
}

function ShopContent() {
  const { state, reload } = useRemoteData(fetchShop);
  const [target, setTarget] = useState<ShopItem | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function confirmPurchase() {
    if (!target || buying) return;
    setBuying(true);
    setBuyError(null);
    try {
      const { plant } = await purchaseRequest({ plantId: target.id });
      setTarget(null);
      setNotice(`${plant.name}을(를) 정원 식구로 맞았어요. 식물 고르기에서 선택할 수 있어요.`);
      reload();
    } catch (error) {
      setBuyError(error instanceof ApiError ? error.message : '구매하지 못했어요.');
    } finally {
      setBuying(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        상점
      </Text>
      {notice && (
        <>
          <FormMessage tone="success" message={notice} />
          <Button title="식물 고르기로 가기" variant="secondary" onPress={() => router.push('/plants')} />
        </>
      )}
      {state.status === 'loading' && <Text style={styles.muted}>불러오는 중…</Text>}
      {state.status === 'error' && (
        <>
          <FormMessage tone="error" message={state.message} />
          <Button title="다시 시도" variant="secondary" onPress={reload} />
        </>
      )}
      {state.status === 'ready' && (
        <>
          <Text style={styles.balance} accessibilityLabel={`보유 코인 ${state.data.coinBalance}코인`}>
            🪙 {state.data.coinBalance.toLocaleString('ko-KR')}코인
          </Text>
          <Text style={styles.muted}>특별한 식물은 코인으로 만날 수 있어요. 한 번 사면 계속 함께해요.</Text>
          <View style={styles.grid}>
            {state.data.items.map((item) => {
              const shortage = item.coinPrice - state.data.coinBalance;
              return (
                <View key={item.id} style={styles.card}>
                  <Text style={[styles.badge, item.catalogClass === 'SPECIAL' && styles.badgeSpecial]}>{item.catalogClass}</Text>
                  <PlantImage plantId={item.id} stage={5} size={120} accessibilityLabel={`${item.name} 그림`} />
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.description}>{item.description}</Text>
                  <Text style={styles.price}>🪙 {item.coinPrice.toLocaleString('ko-KR')}코인</Text>
                  {item.owned ? (
                    <Text style={styles.owned}>보유 중</Text>
                  ) : (
                    <>
                      <Button
                        title="구매하기"
                        onPress={() => {
                          setBuyError(null);
                          setTarget(item);
                        }}
                        disabled={shortage > 0}
                      />
                      {shortage > 0 && <Text style={styles.shortage}>{shortage.toLocaleString('ko-KR')}코인 더 필요해요</Text>}
                    </>
                  )}
                </View>
              );
            })}
          </View>
        </>
      )}
      <ConfirmModal
        visible={target !== null}
        title={target ? `${target.name}을(를) 살까요?` : ''}
        description={target ? `${target.coinPrice.toLocaleString('ko-KR')}코인이 차감돼요. 산 식물은 계정에 영구 보관돼요.` : ''}
        confirmLabel="구매"
        onConfirm={() => void confirmPurchase()}
        onCancel={() => {
          if (!buying) {
            setTarget(null);
            setBuyError(null);
          }
        }}
        loading={buying}>
        {buyError && <FormMessage tone="error" message={buyError} />}
      </ConfirmModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  muted: { fontSize: fontSize.body, color: colors.textMuted },
  balance: { fontSize: fontSize.heading, fontWeight: '700', color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: {
    flexBasis: 220,
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  badge: {
    alignSelf: 'flex-start',
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.surface,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  badgeSpecial: { backgroundColor: colors.danger },
  name: { fontSize: fontSize.body, fontWeight: '700', color: colors.text, textAlign: 'center' },
  description: { fontSize: fontSize.caption, color: colors.textMuted, textAlign: 'center' },
  price: { fontSize: fontSize.body, fontWeight: '600', color: colors.text, textAlign: 'center' },
  owned: { fontSize: fontSize.body, fontWeight: '700', color: colors.primary, textAlign: 'center' },
  shortage: { fontSize: fontSize.caption, color: colors.textMuted, textAlign: 'center' },
});
```

- [ ] **Step 2: 검증**

Run: `cd ~/HaruLeaf && npm run typecheck && npm run lint && npm test`
Expected: 모두 통과.

Web 확인(기존 개발 서버 사용): 새 계정 → 상점 탭 "🪙 0코인", 달빛 꽃(LIMITED 50)·산호빛 안스리움(SPECIAL 100), 둘 다 [구매하기] 비활성 + "50코인 더 필요해요"/"100코인 더 필요해요" → 터미널에서 `npm run dev:grant-coins -- <그 아이디> 60` → 상점 탭 다시 열기 "🪙 60코인", 달빛 꽃 구매 가능 → [구매하기] → 확인 창 → [구매] → 성공 안내·"🪙 10코인"·달빛 꽃 "보유 중" → [식물 고르기로 가기] → 달빛 꽃 선택 가능. 다른 탭에 갔다 오면 안내가 사라져 있음. 콘솔 오류 0.

- [ ] **Step 3: 커밋**

```bash
cd ~/HaruLeaf
git add apps/app
git commit -m "feat: 상점 화면 추가 — LIMITED·SPECIAL 식물 목록, 잔액, 구매 확인과 보유 표시

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## 설계 문서와의 차이 (의도된 결정)

- 출석 버튼 처리 후에는 응답 값을 따로 쓰지 않고 홈을 다시 불러온다(잔액·출석 여부를 한 곳에서 표시).
- 교차 기기(iOS ↔ Web) 수동 확인은 구현 완료 후 사용자 또는 컨트롤러가 수행한다.
