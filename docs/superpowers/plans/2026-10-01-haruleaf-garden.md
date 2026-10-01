# HaruLeaf 6단계 — 월 마감·STANDARD 해금·정원 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 달이 바뀐 뒤 첫 요청에서 지난달 기록을 확정하고, 80% 이상이면 미보유 STANDARD 식물 1종을 무작위로 해금해 홈에서 알리며, 정원에서 연도별 12개월 결과와 월별 일기를 볼 수 있게 한다.

**Architecture:** 서버 `domain/closing.ts`의 `closePastMonths`가 미마감 지난 월 행을 한 트랜잭션에서 월 순서대로 `FOR UPDATE` 잠그고 확정·해금한다. `/home`·`/plants`·`/garden*` 라우트가 처리 전에 이를 호출한다(지연 마감). 정원은 `domain/garden.ts`가 12개월 카드를 만든다. 해금 확인 여부는 `monthly_records.unlock_acknowledged_at`에 저장해 iOS·Web이 같은 상태를 본다.

**Tech Stack:** Node 26, npm workspaces, TypeScript ~6.0.3, zod 4(shared 경유), Fastify 5, Drizzle 0.45 + pg, Vitest 5, Expo SDK 57 + Expo Router.

**설계 문서:** `docs/superpowers/specs/2026-10-01-haruleaf-garden-design.md`

## Global Constraints

- 날짜 판정은 서버 `clock.today()`(Asia/Seoul) 기준. 마감 대상 = `monthly_records.month < 이번 달 1일 AND finalized = false`. 이번 달은 절대 마감하지 않는다. 마감된 월은 다시 쓰지 않는다.
- 확정값: `written_days` = 그 달 diaries 수, `growth_percent` = shared `growthPercent(written, total)`를 `toFixed(2)`로 저장, `growth_stage` = 반올림 전 값으로 shared `growthStage`, `finalized = true`, `finalized_at = now()`.
- 해금 조건: 그 달 `plant_id`가 있고 `isFullyGrown(반올림 전 성장률)`(≥ 80). 후보 = 활성(`is_active`)·미보유 STANDARD, `sort_order`·`id` 순 목록. 후보가 있으면 `pickUnlock(candidateIds)`로 1종 → `user_plants`(`unlock_source = 'ACHIEVEMENT'`, `onConflictDoNothing`) + `monthly_records.unlocked_plant_id`. 후보가 없으면 해금 없이 마감.
- `pickUnlock`은 `AppDeps.pickUnlock?: PickUnlock`(기본 `randomPick`)으로 주입. 반환값이 후보 밖이면 오류.
- 마감은 코인 잔액·원장을 건드리지 않는다.
- 오류: 400 `INVALID_YEAR` "볼 수 없는 연도예요." / 형식 오류는 기존 `VALIDATION_ERROR`(zod 메시지).
- 정원 연도 범위: `minYear` = 그 사용자의 가장 이른 `monthly_records.month` 연도와 올해 중 작은 값(기록 없으면 올해), `maxYear` = 올해.
- 개발용 지난달 기록은 CLI 전용(HTTP 라우트 금지).
- 서버·앱은 zod를 `@haruleaf/shared`로만 쓴다(shared 내부는 `zod` 직접 import). 로그에 비밀번호·토큰·일기 본문·DB message 금지.
- 모든 로그인 필요 라우트는 `protectedRoutes([...])` 안에 등록하고 `protected.test.ts` 401 표에 추가한다.
- 앱 탭 화면은 이동 후에도 마운트되어 있으므로, 화면 상태(메시지·대기)가 있는 화면은 `useIsFocused()` 게이트 또는 blur 시 초기화. 숨김 탭 라우트는 `href: null`.
- 표시 문구: 배지 STANDARD "기본", LIMITED "한정", SPECIAL "스페셜". 출석 버튼 "출석하기 (+n)". 해금 안내 한 줄 "YYYY년 M월 기록으로 ○○을(를) 정원 식구로 맞았어요."
- 커밋 메시지는 한국어, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Docker DB(`npm run db:up`, 5433) 필요.

## 파일 구조

```
packages/shared/src/
  garden.ts               (신규) UnlockNotice, GardenMonth(Status), GardenResponse, GardenMonthResponse, unlockAckSchema, catalogClassLabel
  garden.test.ts          (신규)
  diary.ts                (수정) HomeResponse에 newUnlocks, attendanceCoins
  index.ts                (수정) export './garden'
apps/server/src/
  db/schema.ts            (수정) monthly_records.unlock_acknowledged_at
  db/migrations/0002_unlock_ack.sql (생성물)
  domain/closing.ts       (신규) PickUnlock, randomPick, closePastMonths
  domain/months.ts        (수정) monthSnapshot 확정값 사용, homeFor(newUnlocks, attendanceCoins), acknowledgeUnlocks
  domain/garden.ts        (신규) getGarden, getGardenMonth
  domain/seed-month.ts    (신규) seedMonth
  routes/home.ts          (수정) 마감 호출, POST /unlocks/ack
  routes/garden.ts        (신규) GET /garden, GET /garden/:month
  routes/protected.ts     (수정) ProtectedDeps.pickUnlock
  app.ts                  (수정) AppDeps.pickUnlock, gardenRoutes 등록
  scripts/seed-month.ts   (신규) CLI
apps/server/test/
  closing.test.ts, garden.test.ts, seed-month.test.ts (신규) / home.test.ts, protected.test.ts, shop.test.ts (수정)
apps/app/src/
  api/garden.ts           (신규)
  components/UnlockNotice.tsx (신규), AttendanceCard.tsx (수정)
  app/(main)/index.tsx, shop.tsx, _layout.tsx, garden.tsx (수정)
  app/(main)/garden/[month].tsx (신규)
README.md, package.json, apps/server/package.json (수정) seed-month 명령
```

---

### Task 1: 공유 타입·스키마, DB 칸 추가, 5단계 잔여 테스트

**Files:**
- Create: `packages/shared/src/garden.ts`, `packages/shared/src/garden.test.ts`
- Modify: `packages/shared/src/index.ts`, `apps/server/src/db/schema.ts`
- Create(생성물): `apps/server/src/db/migrations/0002_unlock_ack.sql` (+ drizzle meta)
- Test: `apps/server/test/protected.test.ts`, `apps/server/test/shop.test.ts`

**Interfaces:**
- Produces (shared): `UnlockNotice`, `GardenMonthStatus`, `GardenMonth`, `GardenResponse`, `GardenMonthResponse`, `unlockAckSchema`, `UnlockAckInput`, `catalogClassLabel(cls: CatalogClass): string`.
- Produces (schema): `monthlyRecords.unlockAcknowledgedAt` (`timestamptz`, nullable).

- [ ] **Step 1: 실패하는 shared 테스트** — `packages/shared/src/garden.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { catalogClassLabel, unlockAckSchema } from './garden';

const first = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? undefined : result.error?.issues[0]?.message;

describe('catalogClassLabel', () => {
  it.each([
    ['STANDARD', '기본'],
    ['LIMITED', '한정'],
    ['SPECIAL', '스페셜'],
  ] as const)('%s → %s', (cls, label) => {
    expect(catalogClassLabel(cls)).toBe(label);
  });
});

describe('unlockAckSchema', () => {
  it('월 목록을 받는다', () => {
    expect(unlockAckSchema.parse({ months: ['2026-09', '2026-08'] })).toEqual({ months: ['2026-09', '2026-08'] });
  });

  it.each([{}, { months: [] }, { months: ['2026-9'] }, { months: Array.from({ length: 25 }, () => '2026-09') }])(
    '잘못된 본문 %j 거절',
    (body) => {
      expect(unlockAckSchema.safeParse(body).success).toBe(false);
    },
  );

  it('빈 목록 메시지', () => {
    expect(first(unlockAckSchema.safeParse({ months: [] }))).toBe('확인할 달을 골라주세요.');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/shared`
Expected: FAIL — `./garden` 모듈 없음.

- [ ] **Step 3: shared 구현** — `packages/shared/src/garden.ts`

```ts
import { z } from 'zod';
import { monthKeySchema, type CatalogClass, type PlantSummary } from './diary';
import type { GrowthStage } from './growth';
import { FORM_MESSAGE } from './text';

/** 마감으로 해금됐지만 아직 확인하지 않은 식물 */
export type UnlockNotice = { month: string; plant: PlantSummary };

export type GardenMonthStatus = 'FINALIZED' | 'CURRENT' | 'NO_PLANT' | 'EMPTY';

export type GardenMonth = {
  /** YYYY-MM */
  month: string;
  status: GardenMonthStatus;
  plant: PlantSummary | null;
  writtenDays: number;
  totalDays: number;
  growthPercent: number;
  growthStage: GrowthStage;
  fullyGrown: boolean;
  unlockedPlant: PlantSummary | null;
};

export type GardenResponse = { year: number; minYear: number; maxYear: number; months: GardenMonth[] };
export type GardenMonthResponse = { month: GardenMonth };

const ACK_MESSAGE = '확인할 달을 골라주세요.';
export const unlockAckSchema = z.object(
  { months: z.array(monthKeySchema, { error: ACK_MESSAGE }).min(1, ACK_MESSAGE).max(24, ACK_MESSAGE) },
  { error: FORM_MESSAGE },
);
export type UnlockAckInput = z.infer<typeof unlockAckSchema>;

const CLASS_LABEL: Record<CatalogClass, string> = { STANDARD: '기본', LIMITED: '한정', SPECIAL: '스페셜' };
export function catalogClassLabel(cls: CatalogClass): string {
  return CLASS_LABEL[cls];
}
```

`packages/shared/src/index.ts` 끝에 `export * from './garden';` 추가.

- [ ] **Step 4: shared 통과 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/shared && npm run typecheck -w @haruleaf/shared`
Expected: PASS.

- [ ] **Step 5: DB 칸 추가와 마이그레이션**

`apps/server/src/db/schema.ts`의 `monthlyRecords` 컬럼 목록 끝(`unlockedPlantId` 다음)에 추가:

```ts
    unlockAcknowledgedAt: timestamptz('unlock_acknowledged_at'),
```

Run: `cd ~/HaruLeaf && npm run db:generate -- --name unlock_ack && npm run db:migrate`
Expected: `apps/server/src/db/migrations/0002_unlock_ack.sql`에 `ALTER TABLE "monthly_records" ADD COLUMN "unlock_acknowledged_at" timestamp with time zone;` 한 줄. 다른 변경이 섞여 있으면 중단하고 보고.

(테스트 DB는 `test/global-setup.ts`가 마이그레이션을 적용하므로 별도 작업 없음.)

- [ ] **Step 6: 5단계 잔여 테스트 보강**

`apps/server/test/protected.test.ts`의 `'CORS 사전 요청은 인증하지 않는다'` 테스트의 기대값을 바꾼다:

```ts
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:8081');
```

`apps/server/test/shop.test.ts`의 `describe('POST /shop/purchase', …)` 안에 추가(import에 `plants`를 `../src/db/schema`에서 추가):

```ts
  it('판매 중지된 LIMITED는 404', async () => {
    const { token } = await signupUser(app);
    await grantCoins(db, 'haru_01', 100);
    await db.update(plants).set({ isActive: false }).where(eq(plants.id, 'moonflower'));
    const response = await buy(token, 'moonflower');
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('PLANT_NOT_FOUND');
  });

  it.each([{}, { plantId: '' }, { plantId: 3 }])('본문 %j 는 400', async (payload) => {
    const { token } = await signupUser(app);
    const response = await app.inject({ method: 'POST', url: '/shop/purchase', headers: bearer(token), payload });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });
```

- [ ] **Step 7: 서버 테스트 실행**

Run: `cd ~/HaruLeaf && npm run db:up && npm test -w @haruleaf/server && npm run typecheck`
Expected: 전체 PASS(새 테스트는 기존 동작을 고정하는 회귀 테스트). 실패하면 원인을 보고서에 기록하고 수정.

- [ ] **Step 8: 커밋**

```bash
cd ~/HaruLeaf
git add packages/shared apps/server
git commit -m "feat: 정원·해금 공유 타입과 해금 확인 칸 추가, CORS·상점 회귀 테스트 보강

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 월 마감과 STANDARD 해금

**Files:**
- Create: `apps/server/src/domain/closing.ts`, `apps/server/test/closing.test.ts`
- Modify: `apps/server/src/domain/months.ts`(monthSnapshot), `apps/server/src/routes/protected.ts`, `apps/server/src/routes/home.ts`, `apps/server/src/app.ts`

**Interfaces:**
- Consumes: `monthStartOf`, `nextMonthStart`, `monthSnapshot` (months.ts), `Db`(db/client).
- Produces:
  - `export type PickUnlock = (candidateIds: string[]) => string;`
  - `export const randomPick: PickUnlock`
  - `export async function closePastMonths(db: Db, userId: string, today: string, pickUnlock: PickUnlock): Promise<void>`
  - `ProtectedDeps = { db; clock; attendanceCoins: number; pickUnlock: PickUnlock }`, `AppDeps.pickUnlock?: PickUnlock`
  - `monthSnapshot`이 `finalized` 행이면 저장된 확정값을 반환.
  - `GET /home`, `GET /plants`가 처리 전 `closePastMonths` 실행.

- [ ] **Step 1: 실패하는 테스트** — `apps/server/test/closing.test.ts`

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server -- closing`
Expected: FAIL — `../src/domain/closing` 없음.

- [ ] **Step 3: 마감 구현** — `apps/server/src/domain/closing.ts`

```ts
import { growthPercent, growthStage, isFullyGrown } from '@haruleaf/shared';
import { and, asc, count, eq, gte, isNull, lt } from 'drizzle-orm';
import type { Db } from '../db/client';
import { diaries, monthlyRecords, plants, userPlants } from '../db/schema';
import { monthStartOf, nextMonthStart } from './months';

/** 해금 후보 id 목록(sort_order·id 순)에서 하나를 고른다. */
export type PickUnlock = (candidateIds: string[]) => string;

export const randomPick: PickUnlock = (ids) => {
  const picked = ids[Math.floor(Math.random() * ids.length)];
  if (picked === undefined) throw new Error('해금 후보가 비어 있습니다.');
  return picked;
};

/**
 * 이번 달보다 이전이고 아직 마감하지 않은 달을 확정한다(SYS-11, 프로세스 3.1).
 * 한 트랜잭션에서 월 순서대로 FOR UPDATE로 잠그므로, 동시 요청은 같은 순서로 기다렸다가
 * 이미 마감된 행을 건너뛴다. 코인은 건드리지 않는다.
 */
export async function closePastMonths(db: Db, userId: string, today: string, pickUnlock: PickUnlock): Promise<void> {
  const currentStart = monthStartOf(today);
  const pendingFilter = and(
    eq(monthlyRecords.userId, userId),
    lt(monthlyRecords.month, currentStart),
    eq(monthlyRecords.finalized, false),
  );
  const [pending] = await db.select({ month: monthlyRecords.month }).from(monthlyRecords).where(pendingFilter).limit(1);
  if (!pending) return;

  await db.transaction(async (tx) => {
    const rows = await tx.select().from(monthlyRecords).where(pendingFilter).orderBy(asc(monthlyRecords.month)).for('update');
    for (const row of rows) {
      if (row.finalized) continue;
      const [written] = await tx
        .select({ value: count() })
        .from(diaries)
        .where(and(eq(diaries.userId, userId), gte(diaries.diaryDate, row.month), lt(diaries.diaryDate, nextMonthStart(row.month))));
      const writtenDays = written?.value ?? 0;
      const percent = growthPercent(writtenDays, row.totalDays);

      let unlockedPlantId: string | null = null;
      if (row.plantId && isFullyGrown(percent)) {
        const candidates = await tx
          .select({ id: plants.id })
          .from(plants)
          .leftJoin(userPlants, and(eq(userPlants.plantId, plants.id), eq(userPlants.userId, userId)))
          .where(and(eq(plants.catalogClass, 'STANDARD'), eq(plants.isActive, true), isNull(userPlants.userId)))
          .orderBy(asc(plants.sortOrder), asc(plants.id));
        const ids = candidates.map((candidate) => candidate.id);
        if (ids.length > 0) {
          const picked = pickUnlock(ids);
          if (!ids.includes(picked)) throw new Error(`해금 후보 밖의 식물입니다: ${picked}`);
          await tx.insert(userPlants).values({ userId, plantId: picked, unlockSource: 'ACHIEVEMENT' }).onConflictDoNothing();
          unlockedPlantId = picked;
        }
      }

      await tx
        .update(monthlyRecords)
        .set({
          writtenDays,
          growthPercent: percent.toFixed(2),
          growthStage: growthStage(percent),
          finalized: true,
          finalizedAt: new Date(),
          unlockedPlantId,
        })
        .where(and(eq(monthlyRecords.userId, userId), eq(monthlyRecords.month, row.month)));
    }
  });
}
```

- [ ] **Step 4: 확정값 스냅샷** — `apps/server/src/domain/months.ts`의 `monthSnapshot`

select 목록에 `finalized: monthlyRecords.finalized`, `storedWrittenDays: monthlyRecords.writtenDays`, `storedPercent: monthlyRecords.growthPercent`, `storedStage: monthlyRecords.growthStage`를 추가하고, `return` 직전 계산을 아래로 바꾼다(실시간 diaries 집계 쿼리는 그대로 두되 확정 행이면 결과를 쓰지 않는다):

```ts
  const totalDays = record?.totalDays ?? totalDaysOf(monthStart);
  // 마감된 달은 마감 때 저장한 확정값을 쓴다(이미 마감된 월은 덮어쓰지 않음).
  const writtenDays = record?.finalized ? record.storedWrittenDays : (written?.value ?? 0);
  const percent = record?.finalized ? Number(record.storedPercent) : growthPercent(writtenDays, totalDays);
  const stage = record?.finalized ? (record.storedStage as GrowthStage) : growthStage(percent);
```

반환 객체의 `growthStage: growthStage(percent)`를 `growthStage: stage`로 바꾼다. (`type GrowthStage`를 `@haruleaf/shared` import에 추가.)

- [ ] **Step 5: 의존성 연결**

`apps/server/src/routes/protected.ts`:

```ts
import type { PickUnlock } from '../domain/closing';
export type ProtectedDeps = { db: Db; clock: Clock; attendanceCoins: number; pickUnlock: PickUnlock };
```

`apps/server/src/app.ts`: `AppDeps`에 `pickUnlock?: PickUnlock;` 추가(`import { randomPick, type PickUnlock } from './domain/closing';`), `protectedRoutes(...)` 등록 옵션에 `pickUnlock: deps.pickUnlock ?? randomPick,` 추가.

`apps/server/src/routes/home.ts`의 `/home`·`/plants`:

```ts
export const homeRoutes: ProtectedPlugin = async (app, { db, clock, pickUnlock }) => {
  app.get('/home', async (request): Promise<HomeResponse> => {
    const { userId } = authOf(request);
    const today = clock.today();
    await closePastMonths(db, userId, today, pickUnlock);
    return homeFor(db, userId, today);
  });

  app.get('/plants', async (request): Promise<PlantsResponse> => {
    const { userId } = authOf(request);
    await closePastMonths(db, userId, clock.today(), pickUnlock);
    return listPlants(db, userId);
  });
  // PUT /months/current/plant 는 그대로
```

(`getHome` import를 `homeFor`로 바꾸고 `closePastMonths`를 `../domain/closing`에서 import. `getHome`이 더 이상 쓰이지 않으면 months.ts에서 지운다.)

- [ ] **Step 6: 통과 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server && npm run typecheck`
Expected: 전체 PASS.

- [ ] **Step 7: 커밋**

```bash
cd ~/HaruLeaf
git add apps/server
git commit -m "feat: 지난달 마감과 80% 달성 STANDARD 무작위 해금 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 홈 해금 안내·출석 지급량, 해금 확인 API

**Files:**
- Modify: `packages/shared/src/diary.ts`, `apps/server/src/domain/months.ts`, `apps/server/src/routes/home.ts`
- Test: `apps/server/test/home.test.ts`, `apps/server/test/closing.test.ts`, `apps/server/test/protected.test.ts`

**Interfaces:**
- Consumes: `UnlockNotice`, `unlockAckSchema` (Task 1), `closePastMonths` (Task 2).
- Produces:
  - `HomeResponse = MonthSnapshot & { today; todayDiary; coinBalance; attendedToday; newUnlocks: UnlockNotice[]; attendanceCoins: number }`
  - `homeFor(db: Db, userId: string, today: string, attendanceCoins: number): Promise<HomeResponse>`
  - `selectPlant(db, userId, plantId, clock, attendanceCoins): Promise<HomeResponse>`
  - `acknowledgeUnlocks(db: Db, userId: string, months: string[]): Promise<void>`
  - `POST /unlocks/ack { months }` → `OkResponse`

- [ ] **Step 1: 실패하는 테스트**

`apps/server/test/home.test.ts`의 첫 테스트 `toEqual` 기대 객체에 두 필드를 추가:

```ts
      newUnlocks: [],
      attendanceCoins: 5,
```

`apps/server/test/protected.test.ts` 401 표에 `['POST', '/unlocks/ack'],` 추가.

`apps/server/test/closing.test.ts` 끝에 추가:

```ts
const ack = (token: string, months: unknown) =>
  app.inject({ method: 'POST', url: '/unlocks/ack', headers: bearer(token), payload: { months } });

describe('해금 안내', () => {
  it('마감으로 해금된 식물을 홈에 알린다', async () => {
    const { token, userId } = await signupUser(app);
    clock.set('2026-11-02');
    await pastMonth(userId, '2026-10', 'rose', 25, 31);
    expect((await home(token)).json().newUnlocks).toEqual([
      { month: '2026-10', plant: { id: 'hydrangea', name: '수국', kind: 'FLOWER', catalogClass: 'STANDARD' } },
    ]);
  });

  it('여러 달이면 월 순서대로', async () => {
    const { token, userId } = await signupUser(app);
    clock.set('2026-12-03');
    await pastMonth(userId, '2026-10', 'rose', 25, 31);
    await pastMonth(userId, '2026-11', 'tulip', 24, 30);
    expect((await home(token)).json().newUnlocks.map((notice: { month: string }) => notice.month)).toEqual(['2026-10', '2026-11']);
  });

  it('확인하면 다시 알리지 않는다(다른 기기에서도)', async () => {
    const { token, userId } = await signupUser(app);
    clock.set('2026-11-02');
    await pastMonth(userId, '2026-10', 'rose', 25, 31);
    await home(token);
    const response = await ack(token, ['2026-10']);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect((await home(token)).json().newUnlocks).toEqual([]);
    expect((await recordOf(userId, '2026-10')).unlockAcknowledgedAt).toBeInstanceOf(Date);
  });

  it('해금 없는 달·다른 사용자 달·이미 확인한 달은 무시한다', async () => {
    const a = await signupUser(app, 'haru_01');
    const b = await signupUser(app, 'haru_02');
    clock.set('2026-11-02');
    await pastMonth(b.userId, '2026-10', 'rose', 25, 31);
    await home(b.token);
    expect((await ack(a.token, ['2026-10', '2026-09'])).statusCode).toBe(200);
    expect((await home(b.token)).json().newUnlocks).toHaveLength(1);
    await ack(b.token, ['2026-10']);
    const firstAck = (await recordOf(b.userId, '2026-10')).unlockAcknowledgedAt;
    await ack(b.token, ['2026-10']);
    expect((await recordOf(b.userId, '2026-10')).unlockAcknowledgedAt).toEqual(firstAck);
  });

  it.each([[[]], [['2026-9']], ['2026-10']])('잘못된 본문 %j 는 400', async (months) => {
    const { token } = await signupUser(app);
    const response = await ack(token, months);
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('출석 지급량을 홈에 싣는다', async () => {
    const { token } = await signupUser(app);
    expect((await home(token)).json().attendanceCoins).toBe(5);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server -- closing home protected`
Expected: FAIL — `newUnlocks`·`attendanceCoins` 없음, `/unlocks/ack` 404.

- [ ] **Step 3: 구현**

`packages/shared/src/diary.ts`의 `HomeResponse`에 추가(`import type { UnlockNotice } from './garden';`):

```ts
  /** 마감으로 해금됐지만 아직 확인하지 않은 식물(월 오름차순) */
  newUnlocks: UnlockNotice[];
  /** 출석 1회 지급량 */
  attendanceCoins: number;
```

`apps/server/src/domain/months.ts`:
- `homeFor(db, userId, today, attendanceCoins: number)` — 기존 조회 뒤에 해금 안내 조회를 추가하고 응답에 `newUnlocks`, `attendanceCoins`를 싣는다:

```ts
  const unlockRows = await db
    .select({ month: monthlyRecords.month, id: plants.id, name: plants.name, kind: plants.kind, catalogClass: plants.catalogClass })
    .from(monthlyRecords)
    .innerJoin(plants, eq(plants.id, monthlyRecords.unlockedPlantId))
    .where(
      and(
        eq(monthlyRecords.userId, userId),
        eq(monthlyRecords.finalized, true),
        isNull(monthlyRecords.unlockAcknowledgedAt),
      ),
    )
    .orderBy(asc(monthlyRecords.month));
  const newUnlocks: UnlockNotice[] = unlockRows.map(({ month, ...plant }) => ({
    month: monthKeyOf(month),
    plant: { ...plant, kind: plant.kind as PlantSummary['kind'], catalogClass: plant.catalogClass as PlantSummary['catalogClass'] },
  }));
```

- `selectPlant(db, userId, plantId, clock, attendanceCoins: number)` — 마지막 `return homeFor(db, userId, today, attendanceCoins);`.
- 추가:

```ts
/** 해금 안내를 확인 처리한다. 본인 행 중 해금이 있고 아직 확인하지 않은 달만 바뀐다. */
export async function acknowledgeUnlocks(db: Db, userId: string, months: string[]): Promise<void> {
  await db
    .update(monthlyRecords)
    .set({ unlockAcknowledgedAt: new Date() })
    .where(
      and(
        eq(monthlyRecords.userId, userId),
        inArray(monthlyRecords.month, months.map((month) => `${month}-01`)),
        isNotNull(monthlyRecords.unlockedPlantId),
        isNull(monthlyRecords.unlockAcknowledgedAt),
      ),
    );
}
```

(drizzle import에 `inArray`, `isNotNull`, `isNull` 추가, shared import에 `type UnlockNotice` 추가.)

`apps/server/src/routes/home.ts`: 플러그인 옵션에서 `attendanceCoins`도 꺼내 `homeFor(db, userId, today, attendanceCoins)`, `selectPlant(db, userId, plantId, clock, attendanceCoins)`로 바꾸고 추가:

```ts
  app.post('/unlocks/ack', async (request): Promise<OkResponse> => {
    const { months } = unlockAckSchema.parse(request.body);
    await acknowledgeUnlocks(db, authOf(request).userId, months);
    return { ok: true };
  });
```

- [ ] **Step 4: 통과 확인**

Run: `cd ~/HaruLeaf && npm test && npm run typecheck`
Expected: 전체 PASS. (앱 typecheck가 `HomeResponse` 새 필드로 깨지지 않아야 한다 — 앱은 아직 새 필드를 읽지 않음.)

- [ ] **Step 5: 커밋**

```bash
cd ~/HaruLeaf
git add packages/shared apps/server
git commit -m "feat: 홈에 해금 안내·출석 지급량 추가, 해금 확인 API 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 정원 API

**Files:**
- Create: `apps/server/src/domain/garden.ts`, `apps/server/src/routes/garden.ts`, `apps/server/test/garden.test.ts`
- Modify: `apps/server/src/app.ts`, `apps/server/test/protected.test.ts`

**Interfaces:**
- Consumes: `closePastMonths`, `PickUnlock` (Task 2), `monthSnapshot` (months.ts), `GardenMonth`, `GardenResponse`, `GardenMonthResponse` (Task 1).
- Produces:
  - `getGarden(db: Db, userId: string, year: number, today: string): Promise<GardenResponse>`
  - `getGardenMonth(db: Db, userId: string, month: string, today: string): Promise<GardenMonthResponse>`
  - `GET /garden?year=YYYY`, `GET /garden/:month`

- [ ] **Step 1: 실패하는 테스트** — `apps/server/test/garden.test.ts`

```ts
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
```

`apps/server/test/protected.test.ts` 401 표에 `['GET', '/garden'],`, `['GET', '/garden/2026-09'],` 추가.

- [ ] **Step 2: 실패 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server -- garden protected`
Expected: FAIL — `/garden` 404.

- [ ] **Step 3: 구현** — `apps/server/src/domain/garden.ts`

```ts
import {
  daysInMonth,
  monthKeyOf,
  type GardenMonth,
  type GardenMonthResponse,
  type GardenResponse,
  type PlantSummary,
} from '@haruleaf/shared';
import { and, eq, gte, lte, min } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '../db/client';
import { monthlyRecords, plants } from '../db/schema';
import { AppError } from '../lib/errors';
import { monthSnapshot } from './months';

const invalidYear = () => new AppError('INVALID_YEAR', '볼 수 없는 연도예요.', 400);
const unlocked = alias(plants, 'unlocked_plants');

async function yearRange(db: Db, userId: string, today: string): Promise<{ minYear: number; maxYear: number }> {
  const maxYear = Number(today.slice(0, 4));
  const [row] = await db.select({ earliest: min(monthlyRecords.month) }).from(monthlyRecords).where(eq(monthlyRecords.userId, userId));
  const earliestYear = row?.earliest ? Number(row.earliest.slice(0, 4)) : maxYear;
  return { minYear: Math.min(earliestYear, maxYear), maxYear };
}

function emptyMonth(month: string): GardenMonth {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  return {
    month,
    status: 'EMPTY',
    plant: null,
    writtenDays: 0,
    totalDays: daysInMonth(year, monthNumber),
    growthPercent: 0,
    growthStage: 1,
    fullyGrown: false,
    unlockedPlant: null,
  };
}

/** 주어진 연속 월 목록(YYYY-MM, 오름차순)의 카드. 마감은 호출 전에 끝나 있어야 한다. */
async function monthsBetween(db: Db, userId: string, months: string[], today: string): Promise<GardenMonth[]> {
  const first = `${months[0]}-01`;
  const last = `${months[months.length - 1]}-01`;
  const rows = await db
    .select({
      month: monthlyRecords.month,
      unlockedId: unlocked.id,
      unlockedName: unlocked.name,
      unlockedKind: unlocked.kind,
      unlockedClass: unlocked.catalogClass,
    })
    .from(monthlyRecords)
    .leftJoin(unlocked, eq(unlocked.id, monthlyRecords.unlockedPlantId))
    .where(and(eq(monthlyRecords.userId, userId), gte(monthlyRecords.month, first), lte(monthlyRecords.month, last)));
  const byMonth = new Map(rows.map((row) => [monthKeyOf(row.month), row]));
  const current = monthKeyOf(today);

  const cards: GardenMonth[] = [];
  for (const month of months) {
    const row = byMonth.get(month);
    if (month > current || (!row && month !== current)) {
      cards.push(emptyMonth(month));
      continue;
    }
    const snapshot = await monthSnapshot(db, userId, `${month}-01`);
    const unlockedPlant: PlantSummary | null =
      row?.unlockedId && row.unlockedName && row.unlockedKind && row.unlockedClass
        ? {
            id: row.unlockedId,
            name: row.unlockedName,
            kind: row.unlockedKind as PlantSummary['kind'],
            catalogClass: row.unlockedClass as PlantSummary['catalogClass'],
          }
        : null;
    cards.push({
      month,
      status: month === current ? 'CURRENT' : snapshot.plant ? 'FINALIZED' : 'NO_PLANT',
      plant: snapshot.plant,
      writtenDays: snapshot.writtenDays,
      totalDays: snapshot.totalDays,
      growthPercent: snapshot.growthPercent,
      growthStage: snapshot.growthStage,
      fullyGrown: snapshot.fullyGrown,
      unlockedPlant,
    });
  }
  return cards;
}

export async function getGarden(db: Db, userId: string, year: number, today: string): Promise<GardenResponse> {
  const { minYear, maxYear } = await yearRange(db, userId, today);
  if (year < minYear || year > maxYear) throw invalidYear();
  const months = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
  return { year, minYear, maxYear, months: await monthsBetween(db, userId, months, today) };
}

export async function getGardenMonth(db: Db, userId: string, month: string, today: string): Promise<GardenMonthResponse> {
  const { minYear, maxYear } = await yearRange(db, userId, today);
  const year = Number(month.slice(0, 4));
  if (year < minYear || year > maxYear) throw invalidYear();
  const [card] = await monthsBetween(db, userId, [month], today);
  return { month: card! };
}
```

`apps/server/src/routes/garden.ts`:

```ts
import { monthKeySchema, z, type GardenMonthResponse, type GardenResponse } from '@haruleaf/shared';
import { closePastMonths } from '../domain/closing';
import { getGarden, getGardenMonth } from '../domain/garden';
import { authOf } from '../plugins/auth';
import type { ProtectedPlugin } from './protected';

const YEAR_MESSAGE = '연도 형식이 올바르지 않아요.';
const yearSchema = z.string({ error: YEAR_MESSAGE }).regex(/^[1-9]\d{3}$/, YEAR_MESSAGE).transform(Number);

export const gardenRoutes: ProtectedPlugin = async (app, { db, clock, pickUnlock }) => {
  app.get('/garden', async (request): Promise<GardenResponse> => {
    const { userId } = authOf(request);
    const { year } = request.query as { year?: string };
    const today = clock.today();
    const target = year === undefined ? Number(today.slice(0, 4)) : yearSchema.parse(year);
    await closePastMonths(db, userId, today, pickUnlock);
    return getGarden(db, userId, target, today);
  });

  app.get<{ Params: { month: string } }>('/garden/:month', async (request): Promise<GardenMonthResponse> => {
    const { userId } = authOf(request);
    const month = monthKeySchema.parse(request.params.month);
    const today = clock.today();
    await closePastMonths(db, userId, today, pickUnlock);
    return getGardenMonth(db, userId, month, today);
  });
};
```

`apps/server/src/app.ts`: `import { gardenRoutes } from './routes/garden';`, `protectedRoutes([... , shopRoutes, gardenRoutes])`.

- [ ] **Step 4: 통과 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server && npm run typecheck`
Expected: 전체 PASS.

- [ ] **Step 5: 커밋**

```bash
cd ~/HaruLeaf
git add apps/server
git commit -m "feat: 정원 API 추가 — 연도별 12개월 카드와 월 상세

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 시연용 지난달 기록 명령

**Files:**
- Create: `apps/server/src/domain/seed-month.ts`, `apps/server/src/scripts/seed-month.ts`, `apps/server/test/seed-month.test.ts`
- Modify: `apps/server/package.json`, `package.json`, `README.md`

**Interfaces:**
- Consumes: `lockMonth`, `monthStartOf` (months.ts).
- Produces: `seedMonth(db: Db, loginId: string, month: string, plantId: string, days: number, today: string): Promise<{ month: string; writtenDays: number }>`; 루트 `npm run dev:seed-month -- <아이디> <YYYY-MM> <식물ID> <일수>`.

- [ ] **Step 1: 실패하는 테스트** — `apps/server/test/seed-month.test.ts`

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server -- seed-month`
Expected: FAIL — `../src/domain/seed-month` 없음.

- [ ] **Step 3: 구현** — `apps/server/src/domain/seed-month.ts`

```ts
import { daysInMonth, monthKeySchema } from '@haruleaf/shared';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { diaries, monthlyRecords, userPlants, users } from '../db/schema';
import { lockMonth, monthStartOf } from './months';

export const SEED_DIARY_BODY = '시연용 일기입니다.';

/**
 * 개발·시연 전용: 지난달 식물과 1일~days일 일기를 넣는다. HTTP로는 노출하지 않는다.
 * 넣은 달은 다음 /home·/garden 요청 때 마감된다.
 */
export async function seedMonth(
  db: Db,
  loginId: string,
  month: string,
  plantId: string,
  days: number,
  today: string,
): Promise<{ month: string; writtenDays: number }> {
  const parsed = monthKeySchema.safeParse(month);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? '월 형식이 올바르지 않아요.');
  const monthStart = `${month}-01`;
  if (monthStart >= monthStartOf(today)) throw new Error(`지난 달만 넣을 수 있어요: ${month}`);
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const totalDays = daysInMonth(year, monthNumber);
  if (!Number.isInteger(days) || days < 0 || days > totalDays) {
    throw new Error(`일수는 0~${totalDays} 사이 정수로 넣어주세요.`);
  }

  return db.transaction(async (tx) => {
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.loginId, loginId)).limit(1);
    if (!user) throw new Error(`아이디를 찾을 수 없습니다: ${loginId}`);
    const [owned] = await tx
      .select({ plantId: userPlants.plantId })
      .from(userPlants)
      .where(and(eq(userPlants.userId, user.id), eq(userPlants.plantId, plantId)))
      .limit(1);
    if (!owned) throw new Error(`보유한 식물만 넣을 수 있어요: ${plantId}`);
    const record = await lockMonth(tx, user.id, monthStart);
    if (record.finalized) throw new Error(`이미 마감된 달이에요: ${month}`);
    await tx
      .update(monthlyRecords)
      .set({ plantId, selectionLocked: record.selectionLocked || days > 0 })
      .where(and(eq(monthlyRecords.userId, user.id), eq(monthlyRecords.month, monthStart)));
    if (days > 0) {
      const values = Array.from({ length: days }, (_, index) => ({
        userId: user.id,
        diaryDate: `${month}-${String(index + 1).padStart(2, '0')}`,
        body: SEED_DIARY_BODY,
      }));
      await tx.insert(diaries).values(values).onConflictDoNothing();
    }
    return { month, writtenDays: days };
  });
}
```

(주의: "이미 있는 날짜는 그대로" 테스트에서 `writtenDays`는 넣으려 한 일수(3)를 그대로 돌려준다 — 1일은 기존 일기, 2·3일은 새로 들어가 그 달 작성일수도 3이다.)

`apps/server/src/scripts/seed-month.ts`:

```ts
// 개발·시연 전용: 지난달 식물과 일기를 넣는다. HTTP로는 노출하지 않는다.
// 사용법: npm run dev:seed-month -- <아이디> <YYYY-MM> <식물ID> <일수>
import { loadConfig, loadRootEnv } from '../config';
import { createDb } from '../db/client';
import { seedMonth } from '../domain/seed-month';
import { systemClock } from '../lib/clock';

loadRootEnv();
const [loginId, month, plantId, daysText] = process.argv.slice(2);
if (!loginId || !month || !plantId || !daysText) {
  console.error('사용법: npm run dev:seed-month -- <아이디> <YYYY-MM> <식물ID> <일수>');
  process.exit(1);
}
const config = loadConfig();
const { db, pool } = createDb(config.databaseUrl);
try {
  const today = systemClock(config.timeZone).today();
  const result = await seedMonth(db, loginId.trim().toLowerCase(), month, plantId.trim(), Number(daysText), today);
  console.log(`${loginId}의 ${result.month}에 ${plantId}와 일기 ${result.writtenDays}일을 넣었습니다. 앱을 열면 그 달이 마감됩니다.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : '기록을 넣지 못했습니다.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
```

`apps/server/package.json` scripts에 `"seed-month": "tsx src/scripts/seed-month.ts",`, 루트 `package.json`에 `"dev:seed-month": "npm run seed-month -w @haruleaf/server --",` 추가.

`README.md`의 "시연용 코인 넣기" 절 다음에 추가:

````markdown
### 시연용 지난달 기록

월 마감과 식물 해금은 달이 바뀌어야 보인다. 시연 중에는 아래 명령으로 지난달 식물과 일기(1일부터 n일까지)를 넣은 뒤 앱을 열면, 그 달이 마감되고 80% 이상이면 새 식물 해금 안내가 뜬다.

```bash
npm run dev:seed-month -- <아이디> 2026-09 rose 25
```

이번 달·미래 달, 이미 마감된 달, 보유하지 않은 식물은 거절한다.
````

- [ ] **Step 4: 통과 확인과 명령 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server && npm run typecheck && npm run dev:seed-month -- nobody 2026-09 rose 3; echo "exit=$?"`
Expected: 테스트 PASS, 명령은 "아이디를 찾을 수 없습니다: nobody"와 `exit=1`.

- [ ] **Step 5: 커밋**

```bash
cd ~/HaruLeaf
git add apps/server package.json README.md
git commit -m "feat: 시연용 지난달 기록 명령 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 앱 — 홈 해금 안내, 출석 지급량, 배지 한국어

**Files:**
- Create: `apps/app/src/api/garden.ts`, `apps/app/src/components/UnlockNotice.tsx`
- Modify: `apps/app/src/components/AttendanceCard.tsx`, `apps/app/src/app/(main)/index.tsx`, `apps/app/src/app/(main)/shop.tsx`

**Interfaces:**
- Consumes: `HomeResponse.newUnlocks`, `HomeResponse.attendanceCoins` (Task 3), `catalogClassLabel`, `UnlockNotice`, `GardenResponse`, `GardenMonthResponse`, `UnlockAckInput`, `formatMonthLabel` (shared).
- Produces:
  - `fetchGarden(year?: number): Promise<GardenResponse>`, `fetchGardenMonth(month: string): Promise<GardenMonthResponse>`, `ackUnlocksRequest(input: UnlockAckInput): Promise<OkResponse>` (`api/garden.ts`)
  - `<UnlockNotice unlocks={UnlockNotice[]} onDone={() => void} />`
  - `<AttendanceCard coinBalance attendedToday attendanceCoins onAttended />`

- [ ] **Step 1: API** — `apps/app/src/api/garden.ts`

```ts
import type { GardenMonthResponse, GardenResponse, OkResponse, UnlockAckInput } from '@haruleaf/shared';
import { apiRequest } from './client';

export const fetchGarden = (year?: number) => apiRequest<GardenResponse>(year === undefined ? '/garden' : `/garden?year=${year}`);

export const fetchGardenMonth = (month: string) => apiRequest<GardenMonthResponse>(`/garden/${encodeURIComponent(month)}`);

export const ackUnlocksRequest = (input: UnlockAckInput) => apiRequest<OkResponse>('/unlocks/ack', { method: 'POST', body: input });
```

- [ ] **Step 2: 해금 안내 카드** — `apps/app/src/components/UnlockNotice.tsx`

```tsx
import { formatMonthLabel, type UnlockNotice as Notice } from '@haruleaf/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '@/api/client';
import { ackUnlocksRequest } from '@/api/garden';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';
import { Button } from './Button';
import { FormMessage } from './FormMessage';

type Props = { unlocks: Notice[]; onDone: () => void };

/** 월 마감으로 해금된 식물 안내(확인 전까지 홈에 표시). 확인 여부는 서버에 저장한다. */
export function UnlockNotice({ unlocks, onDone }: Props) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // 탭은 마운트된 채 남으므로 화면을 떠나면 이전 오류 문구를 지운다.
  useFocusEffect(useCallback(() => () => setMessage(null), []));

  async function acknowledge() {
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      await ackUnlocksRequest({ months: unlocks.map((unlock) => unlock.month) });
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : '확인하지 못했어요.');
    } finally {
      setPending(false);
      onDone();
    }
  }

  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.title}>새 식물이 정원에 왔어요</Text>
      {unlocks.map((unlock) => (
        <Text key={unlock.month} style={styles.line}>
          {formatMonthLabel(unlock.month)} 기록으로 {unlock.plant.name}을(를) 정원 식구로 맞았어요.
        </Text>
      ))}
      {message && <FormMessage tone="error" message={message} />}
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button title="확인" onPress={() => void acknowledge()} loading={pending} />
        </View>
        <View style={styles.action}>
          <Button title="식물 고르기" variant="secondary" onPress={() => router.push('/plants')} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { fontSize: fontSize.heading, fontWeight: '700', color: colors.text },
  line: { fontSize: fontSize.body, color: colors.text },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1 },
});
```

- [ ] **Step 3: 출석 버튼 지급량** — `apps/app/src/components/AttendanceCard.tsx`

`Props`에 `attendanceCoins: number` 추가, 함수 인자에서 꺼내고 버튼 제목을 바꾼다:

```tsx
            title={attendedToday ? '오늘 출석 완료' : `출석하기 (+${attendanceCoins})`}
```

- [ ] **Step 4: 홈 연결** — `apps/app/src/app/(main)/index.tsx`

`state.status === 'ready'` 블록을:

```tsx
        <>
          {state.data.newUnlocks.length > 0 && <UnlockNotice unlocks={state.data.newUnlocks} onDone={reload} />}
          <AttendanceCard
            coinBalance={state.data.coinBalance}
            attendedToday={state.data.attendedToday}
            attendanceCoins={state.data.attendanceCoins}
            onAttended={reload}
          />
          <HomeBody home={state.data} />
        </>
```

(`import { UnlockNotice } from '@/components/UnlockNotice';`)

- [ ] **Step 5: 상점 배지 한국어** — `apps/app/src/app/(main)/shop.tsx`

배지 텍스트 `{item.catalogClass}`를 `{catalogClassLabel(item.catalogClass)}`로 바꾸고 `catalogClassLabel`을 `@haruleaf/shared`에서 import.

- [ ] **Step 6: 검사**

Run: `cd ~/HaruLeaf && npm run typecheck && npm run lint`
Expected: 오류 0.

- [ ] **Step 7: 화면 확인**(Web, 개발 서버 실행 중: `npm run dev` 또는 preview `haruleaf-dev`)

1. 테스트 계정을 새로 가입하고 홈에서 식물을 고른다. 출석 버튼이 "출석하기 (+5)"로 보인다.
2. `npm run dev:seed-month -- <그 아이디> 2026-09 rose 25` 실행 후 홈 새로고침 → 해금 안내 카드("2026년 9월 기록으로 ○○을(를) 정원 식구로 맞았어요.")가 출석 카드 위에 보인다.
3. [확인] → 카드가 사라지고, 새로고침해도 다시 나오지 않는다.
4. 상점 배지가 "한정"·"스페셜"로 보인다.
확인 결과(스크린샷 경로 포함)를 보고서에 적는다.

- [ ] **Step 8: 커밋**

```bash
cd ~/HaruLeaf
git add apps/app
git commit -m "feat: 홈에 식물 해금 안내 추가, 출석 버튼에 지급량 표시, 상점 배지 한국어로

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 앱 — 정원 탭과 월 상세

**Files:**
- Modify: `apps/app/src/app/(main)/garden.tsx`, `apps/app/src/app/(main)/_layout.tsx`
- Create: `apps/app/src/app/(main)/garden/[month].tsx`

**Interfaces:**
- Consumes: `fetchGarden`, `fetchGardenMonth` (Task 6), `fetchDiaries` (`api/diary.ts`), `GardenMonth`, `formatGrowthPercent`, `formatMonthLabel` (shared), `PlantImage`, `Screen`, `Button`, `FormMessage`, `useRemoteData`.
- Produces: 정원 탭 화면, 숨김 라우트 `/garden/[month]`.

- [ ] **Step 1: 숨김 라우트 등록** — `apps/app/src/app/(main)/_layout.tsx`

`entry/[date]` 줄 다음에 추가:

```tsx
      <Tabs.Screen name="garden/[month]" options={{ href: null, title: '정원 기록' }} />
```

- [ ] **Step 2: 정원 탭** — `apps/app/src/app/(main)/garden.tsx` 전체 교체

```tsx
import { formatGrowthPercent, type GardenMonth } from '@haruleaf/shared';
import { router, useNavigation } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { fetchGarden } from '@/api/garden';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/FormMessage';
import { PlantImage } from '@/components/PlantImage';
import { Screen } from '@/components/Screen';
import { useRemoteData } from '@/hooks/useRemoteData';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

type TabNavigation = { addListener(event: 'tabPress', callback: () => void): () => void };

const WIDE_BREAKPOINT = 768;

function statusText(card: GardenMonth): string | null {
  if (card.status === 'CURRENT') return '진행 중';
  if (card.status === 'NO_PLANT') return '식물 없음';
  if (card.status === 'FINALIZED' && card.fullyGrown) return '완전 성장';
  return null;
}

export default function GardenScreen() {
  // null = 서버 기준 올해
  const [year, setYear] = useState<number | null>(null);
  const navigation = useNavigation<TabNavigation>();
  // 탭은 마운트된 채 남으므로, 정원 탭을 직접 누를 때만 올해로 되돌린다.
  useEffect(() => navigation.addListener('tabPress', () => setYear(null)), [navigation]);
  const load = useCallback(() => fetchGarden(year ?? undefined), [year]);
  const { state, reload } = useRemoteData(load);
  const { width } = useWindowDimensions();
  const cardWidth = width >= WIDE_BREAKPOINT ? '23%' : '31%';

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        나의 정원
      </Text>
      {state.status === 'loading' && <Text style={styles.muted}>불러오는 중…</Text>}
      {state.status === 'error' && (
        <>
          <FormMessage tone="error" message={state.message} />
          <Button title="다시 시도" variant="secondary" onPress={reload} />
        </>
      )}
      {state.status === 'ready' && (
        <>
          <View style={styles.yearRow}>
            <YearArrow
              label="이전 해"
              symbol="◀"
              disabled={state.data.year <= state.data.minYear}
              onPress={() => setYear(state.data.year - 1)}
            />
            <Text style={styles.yearLabel}>{state.data.year}년</Text>
            <YearArrow
              label="다음 해"
              symbol="▶"
              disabled={state.data.year >= state.data.maxYear}
              onPress={() => setYear(state.data.year + 1)}
            />
          </View>
          <View style={styles.grid}>
            {state.data.months.map((card) => (
              <MonthCard key={card.month} card={card} width={cardWidth} />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

function YearArrow({ label, symbol, disabled, onPress }: { label: string; symbol: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.yearButton, disabled && styles.yearButtonDisabled]}>
      <Text style={styles.yearArrow}>{symbol}</Text>
    </Pressable>
  );
}

function MonthCard({ card, width }: { card: GardenMonth; width: '23%' | '31%' }) {
  const monthNumber = Number(card.month.slice(5, 7));
  const empty = card.status === 'EMPTY';
  const status = statusText(card);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${monthNumber}월${card.plant ? `, ${card.plant.name} ${formatGrowthPercent(card.growthPercent)}%` : ''}`}
      accessibilityState={{ disabled: empty }}
      disabled={empty}
      onPress={() => router.push(`/garden/${card.month}`)}
      style={[styles.card, { width }, empty && styles.cardEmpty, card.status === 'CURRENT' && styles.cardCurrent]}>
      <Text style={styles.cardMonth}>{monthNumber}월</Text>
      {card.plant ? (
        <PlantImage plantId={card.plant.id} stage={card.growthStage} size={64} accessibilityLabel={card.plant.name} />
      ) : (
        <View style={styles.imagePlaceholder} />
      )}
      {card.plant && <Text style={styles.cardPercent}>{formatGrowthPercent(card.growthPercent)}%</Text>}
      {status && <Text style={styles.cardStatus}>{status}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  muted: { fontSize: fontSize.body, color: colors.textMuted },
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  yearButton: { padding: spacing.md },
  yearButtonDisabled: { opacity: 0.3 },
  yearArrow: { fontSize: fontSize.heading, color: colors.primary },
  yearLabel: { fontSize: fontSize.heading, fontWeight: '700', color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardEmpty: { opacity: 0.4 },
  cardCurrent: { borderColor: colors.primary },
  cardMonth: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  imagePlaceholder: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.primarySoft },
  cardPercent: { fontSize: fontSize.caption, color: colors.text },
  cardStatus: { fontSize: fontSize.caption, fontWeight: '600', color: colors.primary },
});
```

- [ ] **Step 3: 월 상세** — `apps/app/src/app/(main)/garden/[month].tsx`

```tsx
import { formatGrowthPercent, formatMonthLabel, type DiaryEntry } from '@haruleaf/shared';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchDiaries } from '@/api/diary';
import { fetchGardenMonth } from '@/api/garden';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/FormMessage';
import { PlantImage } from '@/components/PlantImage';
import { Screen } from '@/components/Screen';
import { useRemoteData } from '@/hooks/useRemoteData';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

function firstLine(body: string): string {
  const line = body.split('\n')[0] ?? '';
  return line.length > 40 ? `${line.slice(0, 40)}…` : line;
}

// 탭 화면은 이동 후에도 마운트된 채 남으므로, 포커스가 없을 땐 내용을 비워 지난 달 파라미터가 남지 않게 한다.
export default function GardenMonthScreen() {
  const isFocused = useIsFocused();
  return isFocused ? <GardenMonthContent /> : null;
}

function GardenMonthContent() {
  const { month } = useLocalSearchParams<{ month: string }>();
  const loadCard = useCallback(() => fetchGardenMonth(month), [month]);
  const loadDiaries = useCallback(() => fetchDiaries(month), [month]);
  const card = useRemoteData(loadCard);
  const list = useRemoteData(loadDiaries);

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        {formatMonthLabel(month)}
      </Text>
      {card.state.status === 'loading' && <Text style={styles.muted}>불러오는 중…</Text>}
      {card.state.status === 'error' && (
        <>
          <FormMessage tone="error" message={card.state.message} />
          <Button title="다시 시도" variant="secondary" onPress={card.reload} />
        </>
      )}
      {card.state.status === 'ready' && (
        <View style={styles.card}>
          {card.state.data.month.status !== 'CURRENT' && <Text style={styles.badge}>읽기 전용</Text>}
          {card.state.data.month.plant ? (
            <>
              <PlantImage
                plantId={card.state.data.month.plant.id}
                stage={card.state.data.month.growthStage}
                size={200}
                accessibilityLabel={`${card.state.data.month.plant.name}, 성장 ${card.state.data.month.growthStage}단계`}
              />
              <Text style={styles.plantName}>{card.state.data.month.plant.name}</Text>
              <Text style={styles.progress}>
                {formatGrowthPercent(card.state.data.month.growthPercent)}% · {card.state.data.month.writtenDays}/
                {card.state.data.month.totalDays}일
              </Text>
              {card.state.data.month.fullyGrown && <Text style={styles.grown}>완전히 자랐어요!</Text>}
            </>
          ) : (
            <Text style={styles.muted}>이 달에는 식물을 고르지 않았어요.</Text>
          )}
          {card.state.data.month.unlockedPlant && (
            <Text style={styles.unlock}>이 달 기록으로 {card.state.data.month.unlockedPlant.name}을(를) 정원 식구로 맞았어요.</Text>
          )}
        </View>
      )}
      <Text style={styles.section}>이 달의 일기</Text>
      {list.state.status === 'error' && <FormMessage tone="error" message={list.state.message} />}
      {list.state.status === 'ready' &&
        (list.state.data.diaries.length === 0 ? (
          <Text style={styles.muted}>이 달에 쓴 일기가 없어요.</Text>
        ) : (
          list.state.data.diaries.map((diary: DiaryEntry) => (
            <Pressable
              key={diary.date}
              accessibilityRole="button"
              accessibilityLabel={`${Number(diary.date.slice(8, 10))}일 일기`}
              onPress={() => router.push(`/entry/${diary.date}`)}
              style={styles.item}>
              <Text style={styles.itemDate}>{Number(diary.date.slice(8, 10))}일</Text>
              <Text style={styles.itemPreview}>{firstLine(diary.body)}</Text>
            </Pressable>
          ))
        ))}
      <Button title="정원으로" variant="secondary" onPress={() => router.navigate('/garden')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  muted: { fontSize: fontSize.body, color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  badge: {
    alignSelf: 'flex-start',
    fontSize: fontSize.caption,
    color: colors.textMuted,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  plantName: { fontSize: fontSize.heading, fontWeight: '700', color: colors.text, textAlign: 'center' },
  progress: { fontSize: fontSize.body, color: colors.text, textAlign: 'center' },
  grown: { fontSize: fontSize.body, fontWeight: '700', color: colors.primary, textAlign: 'center' },
  unlock: { fontSize: fontSize.body, color: colors.primary, textAlign: 'center' },
  section: { fontSize: fontSize.heading, fontWeight: '700', color: colors.text },
  item: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  itemDate: { fontSize: fontSize.caption, fontWeight: '700', color: colors.primary },
  itemPreview: { fontSize: fontSize.body, color: colors.text },
});
```

- [ ] **Step 4: 검사**

Run: `cd ~/HaruLeaf && npm run typecheck && npm run lint`
Expected: 오류 0.

- [ ] **Step 5: 화면 확인**(Web)

Task 6에서 쓴 계정(9월 기록이 마감된 상태)으로:
1. 정원 탭 → "2026년", ◀ 비활성(가장 이른 기록이 올해면)·▶ 비활성, 12개 카드. 9월 카드는 식물 그림·"83.3%"(25/30일)·"완전 성장", 10월 카드는 테두리 강조·"진행 중", 나머지 빈 카드는 흐리고 눌리지 않는다.
2. 9월 카드 → 상세에 "읽기 전용", 성장률·작성일수, "이 달 기록으로 ○○을(를) 정원 식구로 맞았어요.", 일기 목록. 일기 하나 → 기존 일기 상세가 "지난달 기록은 읽기 전용이에요." 표시.
3. 다른 탭으로 갔다가 정원 탭을 다시 누르면 올해로 돌아온다.
4. 브라우저 폭 ≥ 768이면 4열, 모바일 폭(`resize_window` mobile)이면 3열.
확인 결과(스크린샷 경로 포함)를 보고서에 적는다. `garden.tsx`와 `garden/[month].tsx`가 함께 있어도 라우팅이 정상인지(정원 탭이 상세로 바뀌지 않는지) 꼭 확인한다.

- [ ] **Step 6: 커밋**

```bash
cd ~/HaruLeaf
git add apps/app
git commit -m "feat: 정원 화면 추가 — 연도별 12개월 카드와 월 상세·일기 목록

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## 완료 확인 (컨트롤러)

1. `npm test`·`npm run typecheck`·`npm run lint` 전체 통과.
2. 설계 문서 6장의 교차 확인: `dev:seed-month`로 9월 25일 기록 → iOS 홈 해금 안내 → Web 홈 같은 안내 → Web [확인] → iOS 새로고침 시 사라짐 → 식물 고르기에 해금 식물 보유 → 정원 9월 완료·10월 진행 중 → 9월 상세 일기 읽기 전용.
