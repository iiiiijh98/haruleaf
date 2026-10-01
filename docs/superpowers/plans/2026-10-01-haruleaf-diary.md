# HaruLeaf 4단계 — 홈·식물 선택·일기·성장률 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이번 달 식물을 고르고 오늘 일기를 쓰면 월 전체 일수 기준 성장률·단계가 홈에 반영되는 기능을 서버 API와 iOS·Web 화면으로 완성한다.

**Architecture:** 서버는 `domain/months.ts`(월 기록·성장 스냅샷·식물 선택)와 `domain/diaries.ts`(일기 CRUD)에 트랜잭션 로직을 두고, 모든 로그인 필요 라우트를 `routes/protected.ts` 플러그인 안에 등록한다(본문 파싱 전 인증). 입력 규칙·응답 타입·달력 도우미는 `packages/shared`에 둔다. 앱은 `useRemoteData` 훅으로 화면 포커스마다 데이터를 다시 불러오고, `PlantImage`가 `assets/plants/{id}/stage-{n}.png`를 보여준다.

**Tech Stack:** Node 26, npm workspaces, TypeScript ~6.0.3, zod 4(shared 경유), Fastify 5, Drizzle 0.45 + pg, Vitest 5, Expo SDK 57 + Expo Router, react-native 0.86.

**설계 문서:** `docs/superpowers/specs/2026-10-01-haruleaf-diary-design.md`

## Global Constraints

- 날짜는 서버 `clock.today()`(Asia/Seoul, `YYYY-MM-DD`) 기준. 클라이언트는 일기 날짜를 보내지 않는다.
- 이번 달 = `clock.today().slice(0, 7)`. 월 기록 키 = `YYYY-MM-01`.
- 성장률 = 작성일수 ÷ 해당 월 전체 일수 × 100(100 상한), 단계는 반올림 전 값으로 판정(shared `growthPercent`·`growthStage`·`isFullyGrown`). 화면 표시는 소수점 첫째 자리(`formatGrowthPercent`).
- 식물 미선택이면 일기 작성 불가: 409 `PLANT_NOT_SELECTED` "이번 달 식물을 먼저 골라주세요."
- 하루 한 편: 409 `DIARY_EXISTS` "오늘 일기는 이미 있어요. 수정해주세요."
- 이번 달만 수정·삭제: 403 `MONTH_CLOSED` "지난달 기록은 읽기 전용이에요."
- 식물 선택 오류: 404 `PLANT_NOT_FOUND` "식물을 찾을 수 없어요." / 403 `PLANT_NOT_OWNED` "보유한 식물만 고를 수 있어요." / 409 `SELECTION_LOCKED` "첫 일기를 쓴 달은 식물을 바꿀 수 없어요."
- 일기 없음: 404 `DIARY_NOT_FOUND` "일기를 찾을 수 없어요."
- 첫 일기 저장 시 `selection_locked = true`, 일기를 지워도 유지.
- 일기 본문: trim 후 코드포인트 1~10,000자 "일기는 1~10,000자로 써주세요.", NUL 금지 "사용할 수 없는 문자가 들어 있어요.", 내부 줄바꿈 유지.
- 서버 로그에 일기 본문·비밀번호·토큰·DB 오류 message를 남기지 않는다.
- 서버·앱은 zod를 `import { z } from '@haruleaf/shared'`로만 쓴다.
- 식물 그림 경로 `apps/app/assets/plants/{plantId}/stage-{1..5}.png`, 기본 그림 `apps/app/assets/plants/_default/stage-{1..5}.png`.
- 커밋 메시지는 한국어, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Docker DB(`npm run db:up`, 호스트 5433)가 떠 있어야 서버 테스트가 돈다.

## 파일 구조

```
packages/shared/src/
  text.ts            (신규) FORM_MESSAGE, INVALID_CHARACTER_MESSAGE, hasNoNul
  diary.ts           (신규) 일기·식물선택·월·날짜 스키마, 응답 타입
  calendar.ts        (수정) monthKeyOf, shiftMonth, formatMonthLabel
  growth.ts          (수정) formatGrowthPercent
  auth.ts            (수정) FORM_MESSAGE를 text.ts에서, 닉네임 NUL 금지
  index.ts           (수정) text·diary 재수출
  text.test.ts, diary.test.ts, calendar.test.ts(추가), growth.test.ts(추가), auth.test.ts(추가)
apps/server/src/
  lib/errors.ts      (수정) 스택 필터 강화, unauthorized()
  lib/db-errors.ts   (신규) isUniqueViolation
  domain/accounts.ts (수정) unauthorized·isUniqueViolation 사용, last_used_at 5분 제한
  domain/months.ts   (신규) monthStartOf, ensureMonth, lockMonth, monthSnapshot, getHome, listPlants, selectPlant
  domain/diaries.ts  (신규) createDiary, listDiaries, getDiary, updateDiary, deleteDiary
  plugins/auth.ts    (수정) unauthorized()를 errors에서
  routes/protected.ts(신규) protectedRoutes([...])
  routes/auth.ts     (수정) 공개(signup·login) / logoutRoutes 분리
  routes/me.ts       (수정) preHandler 제거
  routes/home.ts     (신규) GET /home, GET /plants, PUT /months/current/plant
  routes/diaries.ts  (신규) /diaries CRUD
  app.ts             (수정) 보호 플러그인 등록
apps/server/test/
  logging.test.ts(추가), protected.test.ts(신규), me.test.ts(추가), months-helpers.ts(신규), home.test.ts(신규), diaries.test.ts(신규)
scripts/
  png.mjs, png.test.mjs, generate-placeholder-plants.mjs (신규)
apps/app/
  assets/plants/{monstera,rose,sunflower,tulip,lavender,_default}/stage-{1..5}.png (생성물, 30장)
  src/api/diary.ts            (신규)
  src/hooks/useRemoteData.ts  (신규)
  src/components/plant-images.ts, PlantImage.tsx, ProgressBar.tsx (신규)
  src/app/(main)/_layout.tsx  (수정) 숨김 화면·backBehavior
  src/app/(main)/index.tsx    (교체) 홈
  src/app/(main)/plants.tsx   (신규) 식물 선택
  src/app/(main)/diary.tsx    (교체) 일기 목록
  src/app/(main)/entry/write.tsx, entry/[date].tsx (신규)
```

---

### Task 1: 오류 로그 스택 필터 강화와 `unauthorized()` 통합

**Files:**
- Modify: `apps/server/src/lib/errors.ts`, `apps/server/src/domain/accounts.ts`, `apps/server/src/plugins/auth.ts`
- Test: `apps/server/test/logging.test.ts` (테스트 추가)

**Interfaces:**
- Produces: `unauthorized(): AppError` (`UNAUTHORIZED`, "다시 로그인해주세요.", 401) — `lib/errors.ts`에서 export. `serializeError`는 메시지 이후의 `^\s+at .+:\d+:\d+\)?$` 줄만 남긴다.

- [ ] **Step 1: 실패하는 테스트 추가** — `apps/server/test/logging.test.ts`의 `describe('serializeError', …)` 안에 추가:

```ts
  it('여러 줄 메시지 안에서 "at "으로 시작하는 줄도 남기지 않는다', () => {
    const error = new Error('Failed query: insert into diaries\nparams: 엄마랑 공원에 갔다\nat secret-diary-line');
    const result = serializeError(error);
    expect(result.stack).toBeDefined();
    expect(result.stack).not.toContain('secret-diary-line');
    expect(result.stack).not.toContain('엄마랑');
    for (const line of result.stack!.split('\n')) {
      expect(line).toMatch(/^\s+at .+:\d+:\d+\)?$/);
    }
  });
```

같은 파일 `describe('500 오류 로그', …)` 안에 추가:

```ts
  it('여러 줄 파라미터가 들어간 DB 오류도 본문을 로그에 남기지 않는다', async () => {
    const lines: string[] = [];
    const app = await buildApp({
      db,
      clock: fixedClock('2026-09-30'),
      corsOrigins: [],
      logStream: { write: (message) => void lines.push(message) },
    });
    app.get('/__test/db-fail-multiline', async () => {
      await db.execute(sql`select ${'첫 줄\nat secret-diary'}::int`);
      return { ok: true };
    });
    try {
      const response = await app.inject({ method: 'GET', url: '/__test/db-fail-multiline', headers: { 'x-client-platform': 'ios' } });
      expect(response.statusCode).toBe(500);
      const log = lines.join('');
      expect(log).toContain('unhandled error');
      expect(log).not.toContain('secret-diary');
      expect(log).not.toContain('첫 줄');
    } finally {
      await app.close();
    }
  });
```

- [ ] **Step 2: 실패 확인**

Run: `cd ~/HaruLeaf && npm run db:up && npm test -w @haruleaf/server -- test/logging.test.ts`
Expected: FAIL — 새 단위 테스트에서 `secret-diary-line`이 stack에 포함됨.

- [ ] **Step 3: 구현** — `apps/server/src/lib/errors.ts`의 `ErrorLike`와 `serializeError`를 교체하고 `unauthorized`를 추가:

```ts
type ErrorLike = {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  stack?: unknown;
  cause?: { code?: unknown; constraint?: unknown; table?: unknown };
};

/** V8 스택 프레임 줄: "    at 함수 (파일:줄:칸)" 또는 "    at 파일:줄:칸" */
const STACK_FRAME = /^\s+at .+:\d+:\d+\)?$/;

/**
 * 로그용 오류 요약. DB 오류 message에는 쿼리 파라미터(일기 본문 등)가 들어있어 message는 남기지 않는다.
 * 스택 앞부분에는 message가 그대로 들어있으므로 message 뒤부터, 프레임 형식인 줄만 남긴다.
 */
export function serializeError(error: unknown) {
  const e = (typeof error === 'object' && error !== null ? error : {}) as ErrorLike;
  let stack: string | undefined;
  if (typeof e.stack === 'string') {
    const message = typeof e.message === 'string' ? e.message : '';
    const index = message ? e.stack.indexOf(message) : -1;
    const afterMessage = index >= 0 ? e.stack.slice(index + message.length) : e.stack;
    const frames = afterMessage.split('\n').filter((line) => STACK_FRAME.test(line));
    stack = frames.length > 0 ? frames.join('\n') : undefined;
  }
  return {
    name: typeof e.name === 'string' ? e.name : 'Error',
    code: e.cause?.code ?? e.code,
    constraint: e.cause?.constraint,
    table: e.cause?.table,
    stack,
  };
}

export const unauthorized = () => new AppError('UNAUTHORIZED', '다시 로그인해주세요.', 401);
```

`apps/server/src/domain/accounts.ts`: `const unauthorized = () => new AppError(...)` 줄을 삭제하고 import를 `import { AppError, unauthorized } from '../lib/errors';`로 바꾼다.

`apps/server/src/plugins/auth.ts`: `const unauthorized = …` 줄을 삭제하고 import를 `import { unauthorized } from '../lib/errors';`로 바꾼다(`AppError` import가 더 이상 쓰이지 않으면 제거).

- [ ] **Step 4: 통과 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server && npm run typecheck -w @haruleaf/server`
Expected: 전체 PASS(기존 `serializeError` 테스트 포함), 타입 오류 0.

- [ ] **Step 5: 커밋**

```bash
cd ~/HaruLeaf
git add apps/server
git commit -m "fix: 오류 로그 스택에서 여러 줄 메시지를 완전히 제거하고 unauthorized 오류를 한곳으로 통합

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 보호 라우트 플러그인과 `last_used_at` 갱신 제한

**Files:**
- Create: `apps/server/src/routes/protected.ts`
- Modify: `apps/server/src/routes/auth.ts`, `apps/server/src/routes/me.ts`, `apps/server/src/app.ts`, `apps/server/src/domain/accounts.ts`
- Test: `apps/server/test/protected.test.ts` (신규), `apps/server/test/me.test.ts` (추가)

**Interfaces:**
- Consumes: `createRequireAuth(db)`, `authOf(request)` (기존)
- Produces:
  - `type ProtectedDeps = { db: Db; clock: Clock }`, `type ProtectedPlugin = FastifyPluginAsync<ProtectedDeps>`
  - `protectedRoutes(plugins: ProtectedPlugin[]): FastifyPluginAsync<ProtectedDeps>` — 캡슐화된 컨텍스트에 `onRequest` 인증 훅을 걸고 plugins를 등록
  - `authRoutes: FastifyPluginAsync<{ db: Db }>`(signup·login), `logoutRoutes: ProtectedPlugin`, `meRoutes: ProtectedPlugin`
  - `LAST_USED_REFRESH_MS = 300_000`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/server/test/protected.test.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { seedCatalog } from '../src/db/seed';
import { fixedClock } from '../src/lib/clock';
import { bearer, IOS, signupViaApi } from './auth-helpers';
import { createTestDb, resetDatabase } from './helpers';

const { db, pool } = createTestDb();
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ db, clock: fixedClock('2026-10-15'), corsOrigins: [] });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

beforeEach(async () => {
  await resetDatabase(db);
  await seedCatalog(db);
});

describe('보호 라우트', () => {
  it('미인증 요청은 본문을 읽기 전에 401', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: { ...IOS, 'content-type': 'application/json' },
      payload: '{ broken',
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });

  it('로그아웃도 보호 라우트다', async () => {
    expect((await app.inject({ method: 'POST', url: '/auth/logout', headers: IOS })).statusCode).toBe(401);
  });

  it('공개 라우트(가입·로그인)는 토큰 없이 동작한다', async () => {
    expect((await signupViaApi(app)).statusCode).toBe(201);
  });

  it('인증된 요청은 그대로 처리된다', async () => {
    const { token } = (await signupViaApi(app)).json();
    const response = await app.inject({ method: 'PATCH', url: '/me', headers: bearer(token), payload: { nickname: '새잎' } });
    expect(response.statusCode).toBe(200);
  });
});
```

`apps/server/test/me.test.ts`의 `describe('세션', …)` 안에 추가:

```ts
  it('5분이 지나지 않았으면 last_used_at을 갱신하지 않는다', async () => {
    const token = (await signupViaApi(app)).json().token as string;
    const recent = new Date(Date.now() - 60_000);
    await db.update(sessions).set({ lastUsedAt: recent });
    await getMe(token);
    const [session] = await db.select().from(sessions);
    expect(session!.lastUsedAt.getTime()).toBe(recent.getTime());
  });
```

- [ ] **Step 2: 실패 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server -- test/protected.test.ts test/me.test.ts`
Expected: FAIL — 깨진 본문 요청이 400(본문 먼저 파싱), last_used_at이 갱신됨.

- [ ] **Step 3: 구현**

`apps/server/src/routes/protected.ts`:

```ts
import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '../db/client';
import type { Clock } from '../lib/clock';
import { createRequireAuth } from '../plugins/auth';

export type ProtectedDeps = { db: Db; clock: Clock };
export type ProtectedPlugin = FastifyPluginAsync<ProtectedDeps>;

/** 이 플러그인 안에 등록한 라우트는 본문을 읽기 전에(onRequest) 로그인을 확인한다. */
export function protectedRoutes(plugins: ProtectedPlugin[]): FastifyPluginAsync<ProtectedDeps> {
  return async (app, deps) => {
    app.addHook('onRequest', createRequireAuth(deps.db));
    for (const plugin of plugins) {
      await app.register(plugin, deps);
    }
  };
}
```

`apps/server/src/routes/auth.ts` 전체 교체:

```ts
import { loginSchema, signupSchema, type OkResponse } from '@haruleaf/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '../db/client';
import { login, logout, signup } from '../domain/accounts';
import { clientMeta } from '../lib/request-meta';
import { authOf } from '../plugins/auth';
import type { ProtectedPlugin } from './protected';

export const authRoutes: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  app.post('/auth/signup', async (request, reply) => {
    const input = signupSchema.parse(request.body);
    const result = await signup(db, input, clientMeta(request));
    return reply.status(201).send(result);
  });

  app.post('/auth/login', async (request) => {
    const input = loginSchema.parse(request.body);
    return login(db, input, clientMeta(request));
  });
};

export const logoutRoutes: ProtectedPlugin = async (app, { db }) => {
  app.post('/auth/logout', async (request): Promise<OkResponse> => {
    await logout(db, authOf(request), clientMeta(request));
    return { ok: true };
  });
};
```

`apps/server/src/routes/me.ts` 전체 교체:

```ts
import { deleteAccountSchema, updateNicknameSchema, type MeResponse, type OkResponse } from '@haruleaf/shared';
import { deleteAccount, getUser, updateNickname } from '../domain/accounts';
import { authOf } from '../plugins/auth';
import type { ProtectedPlugin } from './protected';

export const meRoutes: ProtectedPlugin = async (app, { db }) => {
  app.get('/me', async (request): Promise<MeResponse> => ({
    user: await getUser(db, authOf(request).userId),
  }));

  app.patch('/me', async (request): Promise<MeResponse> => {
    const { nickname } = updateNicknameSchema.parse(request.body);
    return { user: await updateNickname(db, authOf(request).userId, nickname) };
  });

  app.delete('/me', async (request): Promise<OkResponse> => {
    const { password } = deleteAccountSchema.parse(request.body);
    await deleteAccount(db, authOf(request).userId, password);
    return { ok: true };
  });
};
```

`apps/server/src/app.ts`: import를 정리하고 라우트 등록부를 교체:

```ts
import { authRoutes, logoutRoutes } from './routes/auth';
import { healthRoutes } from './routes/health';
import { meRoutes } from './routes/me';
import { protectedRoutes } from './routes/protected';
```

(`createRequireAuth` import 삭제)

```ts
  await app.register(healthRoutes, { db: deps.db, clock: deps.clock });
  await app.register(authRoutes, { db: deps.db });
  await app.register(protectedRoutes([logoutRoutes, meRoutes]), { db: deps.db, clock: deps.clock });
```

`apps/server/src/domain/accounts.ts`의 `authenticate` 교체(상수 추가):

```ts
/** 세션 사용 시각은 이 간격이 지났을 때만 갱신한다(요청마다 DB 쓰기 방지). */
export const LAST_USED_REFRESH_MS = 5 * 60 * 1000;

export async function authenticate(db: Db, token: string, now = new Date()): Promise<AuthContext | null> {
  const [row] = await db
    .select({ sessionId: sessions.id, userId: users.id, loginId: users.loginId, lastUsedAt: sessions.lastUsedAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row) return null;
  if (now.getTime() - row.lastUsedAt.getTime() >= LAST_USED_REFRESH_MS) {
    await db.update(sessions).set({ lastUsedAt: now }).where(eq(sessions.id, row.sessionId));
  }
  return { sessionId: row.sessionId, userId: row.userId, loginId: row.loginId };
}
```

`apps/server/src/plugins/auth.ts`의 `RequireAuth` 타입은 더 이상 쓰이지 않으면 삭제한다.

- [ ] **Step 4: 통과 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server && npm run typecheck -w @haruleaf/server`
Expected: 전체 PASS(기존 auth·me 테스트 포함), 타입 오류 0.

- [ ] **Step 5: 커밋**

```bash
cd ~/HaruLeaf
git add apps/server
git commit -m "refactor: 로그인 필요 라우트를 보호 플러그인으로 묶고 세션 사용 시각 갱신을 5분 간격으로 제한

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 공용 일기 스키마·타입·달력 도우미, NUL 금지

**Files:**
- Create: `packages/shared/src/text.ts`, `packages/shared/src/diary.ts`
- Modify: `packages/shared/src/auth.ts`, `calendar.ts`, `growth.ts`, `index.ts`
- Test: `packages/shared/src/text.test.ts`, `diary.test.ts` (신규), `calendar.test.ts`, `growth.test.ts`, `auth.test.ts` (추가)

**Interfaces:**
- Produces (`@haruleaf/shared`):
  - `FORM_MESSAGE = '입력값을 확인해주세요.'`, `INVALID_CHARACTER_MESSAGE = '사용할 수 없는 문자가 들어 있어요.'`, `hasNoNul(value: string): boolean`
  - `DIARY_BODY_MAX = 10000`, `DIARY_BODY_MESSAGE = '일기는 1~10,000자로 써주세요.'`, `diaryBodySchema`, `diaryInputSchema = { body }`, `selectPlantSchema = { plantId }`, `monthKeySchema`(`YYYY-MM`), `diaryDateSchema`(실제 존재하는 `YYYY-MM-DD`)
  - 타입: `DiaryInput`, `SelectPlantInput`, `PlantKind`, `CatalogClass`, `PlantSummary = { id; name; kind; catalogClass }`, `CatalogPlant = PlantSummary & { description: string; coinPrice: number | null; owned: boolean }`, `PlantsResponse = { plants: CatalogPlant[] }`, `MonthSnapshot = { month: string; plant: PlantSummary | null; selectionLocked: boolean; writtenDays: number; totalDays: number; growthPercent: number; growthStage: GrowthStage; fullyGrown: boolean }`, `HomeResponse = MonthSnapshot & { today: string; todayDiary: boolean }`, `DiaryEntry = { date: string; body: string; createdAt: string; updatedAt: string }`, `DiaryListResponse = { month: string; today: string; editable: boolean; diaries: DiaryEntry[] }`, `DiaryResponse = { diary: DiaryEntry; editable: boolean }`, `DiaryMutationResponse = { diary: DiaryEntry }`
  - `monthKeyOf(date: string): string` (`'2026-10-15'` → `'2026-10'`), `shiftMonth(month: string, delta: number): string`, `formatMonthLabel(month: string): string` (`'2026-10'` → `'2026년 10월'`)
  - `formatGrowthPercent(percent: number): string` (소수점 첫째 자리)

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/shared/src/text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hasNoNul } from './text';

describe('hasNoNul', () => {
  it('NUL 문자가 없으면 true', () => {
    expect(hasNoNul('하루 한 잎\n둘째 줄')).toBe(true);
  });
  it('NUL 문자가 있으면 false', () => {
    expect(hasNoNul('a\u0000b')).toBe(false);
  });
});
```

`packages/shared/src/diary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { diaryBodySchema, diaryDateSchema, diaryInputSchema, monthKeySchema, selectPlantSchema } from './diary';

const first = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? undefined : result.error?.issues[0]?.message;

describe('diaryBodySchema', () => {
  it('앞뒤 공백은 지우고 내부 줄바꿈은 유지한다', () => {
    expect(diaryBodySchema.parse('  오늘은\n맑았다  ')).toBe('오늘은\n맑았다');
  });

  it('10,000자까지 허용, 10,001자는 거절', () => {
    expect(diaryBodySchema.parse('가'.repeat(10000))).toHaveLength(10000);
    expect(first(diaryBodySchema.safeParse('가'.repeat(10001)))).toBe('일기는 1~10,000자로 써주세요.');
  });

  it.each(['', '   ', '\n\n'])('빈 본문 %j 거절', (value) => {
    expect(first(diaryBodySchema.safeParse(value))).toBe('일기는 1~10,000자로 써주세요.');
  });

  it('NUL 문자 거절', () => {
    expect(first(diaryBodySchema.safeParse('오늘\u0000'))).toBe('사용할 수 없는 문자가 들어 있어요.');
  });

  it('diaryInputSchema는 본문이 없으면 폼 메시지', () => {
    expect(first(diaryInputSchema.safeParse(undefined))).toBe('입력값을 확인해주세요.');
  });
});

describe('selectPlantSchema', () => {
  it('식물 코드를 받는다', () => {
    expect(selectPlantSchema.parse({ plantId: 'monstera' })).toEqual({ plantId: 'monstera' });
    expect(first(selectPlantSchema.safeParse({ plantId: '' }))).toBe('식물을 골라주세요.');
  });
});

describe('monthKeySchema · diaryDateSchema', () => {
  it.each(['2026-10', '2026-01', '2026-12'])('월 %s 허용', (value) => {
    expect(monthKeySchema.parse(value)).toBe(value);
  });
  it.each(['2026-13', '2026-1', '26-10', '2026-10-01'])('월 %s 거절', (value) => {
    expect(first(monthKeySchema.safeParse(value))).toBe('월 형식이 올바르지 않아요.');
  });
  it.each(['2026-10-15', '2028-02-29'])('날짜 %s 허용', (value) => {
    expect(diaryDateSchema.parse(value)).toBe(value);
  });
  it.each(['2026-02-30', '2026-02-29', '2026-10-32', '2026-10-1', 'today'])('날짜 %s 거절', (value) => {
    expect(first(diaryDateSchema.safeParse(value))).toBe('날짜 형식이 올바르지 않아요.');
  });
});
```

`packages/shared/src/calendar.test.ts` 끝에 추가:

```ts
import { formatMonthLabel, monthKeyOf, shiftMonth } from './calendar';

describe('월 도우미', () => {
  it('monthKeyOf', () => {
    expect(monthKeyOf('2026-10-15')).toBe('2026-10');
  });

  it.each([
    ['2026-10', -1, '2026-09'],
    ['2026-01', -1, '2025-12'],
    ['2026-12', 1, '2027-01'],
    ['2026-10', 0, '2026-10'],
    ['2026-10', -13, '2025-09'],
  ])('shiftMonth(%s, %i) = %s', (month, delta, expected) => {
    expect(shiftMonth(month, delta)).toBe(expected);
  });

  it('formatMonthLabel', () => {
    expect(formatMonthLabel('2026-10')).toBe('2026년 10월');
    expect(formatMonthLabel('2027-01')).toBe('2027년 1월');
  });
});
```

(기존 import 줄 `import { daysInMonth } from './calendar';`는 위 import와 합쳐도 된다.)

`packages/shared/src/growth.test.ts` 끝에 추가:

```ts
import { formatGrowthPercent } from './growth';

describe('formatGrowthPercent', () => {
  it.each([
    [0, '0.0'],
    [100 / 31, '3.2'],
    [(24 / 31) * 100, '77.4'],
    [(25 / 31) * 100, '80.6'],
    [100, '100.0'],
  ])('%s → %s', (percent, expected) => {
    expect(formatGrowthPercent(percent)).toBe(expected);
  });
});
```

`packages/shared/src/auth.test.ts`의 `describe('nicknameSchema', …)` 안에 추가:

```ts
  it('NUL 문자 거절', () => {
    expect(firstMessage(nicknameSchema.safeParse('진\u0000화'))).toBe('사용할 수 없는 문자가 들어 있어요.');
  });
```

- [ ] **Step 2: 실패 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/shared`
Expected: FAIL — `./text`, `./diary` 모듈 없음, `monthKeyOf` 등 export 없음, 닉네임 NUL 통과.

- [ ] **Step 3: 구현**

`packages/shared/src/text.ts`:

```ts
export const FORM_MESSAGE = '입력값을 확인해주세요.';
export const INVALID_CHARACTER_MESSAGE = '사용할 수 없는 문자가 들어 있어요.';

/** PostgreSQL text에는 NUL(\u0000)을 저장할 수 없다. */
export const hasNoNul = (value: string): boolean => !value.includes('\u0000');
```

`packages/shared/src/auth.ts` 수정:
- `const FORM_MESSAGE = '입력값을 확인해주세요.';` 줄을 삭제하고 상단에 `import { FORM_MESSAGE, hasNoNul, INVALID_CHARACTER_MESSAGE } from './text';` 추가.
- `nicknameSchema` 끝에 `.refine(hasNoNul, INVALID_CHARACTER_MESSAGE)`를 이어 붙인다(길이 refine 뒤).

`packages/shared/src/diary.ts`:

```ts
import { z } from 'zod';
import type { GrowthStage } from './growth';
import { FORM_MESSAGE, hasNoNul, INVALID_CHARACTER_MESSAGE } from './text';

export const DIARY_BODY_MAX = 10_000;
export const DIARY_BODY_MESSAGE = '일기는 1~10,000자로 써주세요.';

export const diaryBodySchema = z
  .string({ error: DIARY_BODY_MESSAGE })
  .trim()
  .refine((value) => {
    const length = Array.from(value).length;
    return length >= 1 && length <= DIARY_BODY_MAX;
  }, DIARY_BODY_MESSAGE)
  .refine(hasNoNul, INVALID_CHARACTER_MESSAGE);

export const diaryInputSchema = z.object({ body: diaryBodySchema }, { error: FORM_MESSAGE });

const PLANT_MESSAGE = '식물을 골라주세요.';
export const selectPlantSchema = z.object(
  { plantId: z.string({ error: PLANT_MESSAGE }).min(1, PLANT_MESSAGE).max(40, PLANT_MESSAGE) },
  { error: FORM_MESSAGE },
);

const MONTH_MESSAGE = '월 형식이 올바르지 않아요.';
export const monthKeySchema = z.string({ error: MONTH_MESSAGE }).regex(/^\d{4}-(0[1-9]|1[0-2])$/, MONTH_MESSAGE);

const DATE_MESSAGE = '날짜 형식이 올바르지 않아요.';
export const diaryDateSchema = z
  .string({ error: DATE_MESSAGE })
  .regex(/^\d{4}-\d{2}-\d{2}$/, DATE_MESSAGE)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, DATE_MESSAGE);

export type DiaryInput = z.infer<typeof diaryInputSchema>;
export type SelectPlantInput = z.infer<typeof selectPlantSchema>;

export type PlantKind = 'PLANT' | 'FLOWER';
export type CatalogClass = 'STANDARD' | 'LIMITED' | 'SPECIAL';

export type PlantSummary = { id: string; name: string; kind: PlantKind; catalogClass: CatalogClass };
export type CatalogPlant = PlantSummary & { description: string; coinPrice: number | null; owned: boolean };
export type PlantsResponse = { plants: CatalogPlant[] };

export type MonthSnapshot = {
  /** YYYY-MM */
  month: string;
  plant: PlantSummary | null;
  selectionLocked: boolean;
  writtenDays: number;
  totalDays: number;
  /** 반올림 전 값 */
  growthPercent: number;
  growthStage: GrowthStage;
  fullyGrown: boolean;
};

export type HomeResponse = MonthSnapshot & { today: string; todayDiary: boolean };

export type DiaryEntry = { date: string; body: string; createdAt: string; updatedAt: string };
export type DiaryListResponse = { month: string; today: string; editable: boolean; diaries: DiaryEntry[] };
export type DiaryResponse = { diary: DiaryEntry; editable: boolean };
export type DiaryMutationResponse = { diary: DiaryEntry };
```

`packages/shared/src/calendar.ts`에 추가:

```ts
/** 'YYYY-MM-DD' → 'YYYY-MM' */
export function monthKeyOf(date: string): string {
  return date.slice(0, 7);
}

/** 'YYYY-MM'을 delta개월 이동 */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const index = year * 12 + (monthNumber - 1) + delta;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

/** 'YYYY-MM' → 'YYYY년 M월' */
export function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  return `${year}년 ${monthNumber}월`;
}
```

`packages/shared/src/growth.ts`에 추가:

```ts
/** 화면 표시용 성장률(소수점 첫째 자리, BR-05). 단계 판정에는 쓰지 않는다. */
export function formatGrowthPercent(percent: number): string {
  return (Math.round(percent * 10) / 10).toFixed(1);
}
```

`packages/shared/src/index.ts`에 추가:

```ts
export * from './diary';
export * from './text';
```

- [ ] **Step 4: 통과 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/shared && npm run typecheck`
Expected: shared 전체 PASS, 모든 워크스페이스 타입 오류 0.

- [ ] **Step 5: 커밋**

```bash
cd ~/HaruLeaf
git add packages/shared
git commit -m "feat: 공용 일기·식물 선택 스키마와 응답 타입, 월 도우미 추가, 닉네임·일기 NUL 문자 금지

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 이번 달 기록·홈·식물 목록·식물 선택 API

**Files:**
- Create: `apps/server/src/lib/db-errors.ts`, `apps/server/src/domain/months.ts`, `apps/server/src/routes/home.ts`
- Modify: `apps/server/src/domain/accounts.ts` (isUniqueViolation 사용), `apps/server/src/app.ts`
- Create: `apps/server/test/months-helpers.ts`
- Test: `apps/server/test/home.test.ts`

**Interfaces:**
- Consumes: Task 2 `ProtectedPlugin`, `protectedRoutes`; Task 3 타입·`selectPlantSchema`; shared `daysInMonth`·`growthPercent`·`growthStage`·`isFullyGrown`·`monthKeyOf`
- Produces:
  - `isUniqueViolation(error: unknown, constraint: string): boolean`
  - `monthStartOf(date: string): string` (`'2026-10-15'` → `'2026-10-01'`), `nextMonthStart(monthStart: string): string`
  - `ensureMonth(executor, userId, monthStart): Promise<void>`, `lockMonth(tx, userId, monthStart): Promise<typeof monthlyRecords.$inferSelect>`
  - `monthSnapshot(db, userId, monthStart): Promise<MonthSnapshot>`
  - `getHome(db, userId, clock): Promise<HomeResponse>`, `listPlants(db, userId): Promise<PlantsResponse>`, `selectPlant(db, userId, plantId, clock): Promise<HomeResponse>`
  - `type Executor`, `type Tx` (export from months.ts — Task 5 재사용)
  - `homeRoutes: ProtectedPlugin`
  - 테스트 헬퍼: `mutableClock(initial)`, `signupUser(app)`, `insertDiaries(db, userId, dates)`, `datesInMonth(month, count)`

- [ ] **Step 1: 테스트 헬퍼 작성** — `apps/server/test/months-helpers.ts`

```ts
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
```

- [ ] **Step 2: 실패하는 테스트 작성** — `apps/server/test/home.test.ts`

```ts
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { monthlyRecords } from '../src/db/schema';
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

  it('로그인하지 않으면 401', async () => {
    const response = await app.inject({ method: 'GET', url: '/home', headers: { 'x-client-platform': 'ios' } });
    expect(response.statusCode).toBe(401);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server -- test/home.test.ts`
Expected: FAIL — `/home` 등 404.

- [ ] **Step 4: 구현**

`apps/server/src/lib/db-errors.ts`:

```ts
/** drizzle가 감싼 pg 오류(cause) 또는 pg 오류에서 유일 제약 위반(23505)인지 확인한다. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const e = error as { code?: unknown; constraint?: unknown; cause?: { code?: unknown; constraint?: unknown } };
  const code = e?.cause?.code ?? e?.code;
  const name = e?.cause?.constraint ?? e?.constraint;
  return code === '23505' && name === constraint;
}
```

`apps/server/src/domain/accounts.ts`: `isLoginIdTaken` 함수를 삭제하고 `import { isUniqueViolation } from '../lib/db-errors';`를 추가, `if (isLoginIdTaken(error))` → `if (isUniqueViolation(error, 'users_login_id_unique'))`.

`apps/server/src/domain/months.ts`:

```ts
import {
  daysInMonth,
  growthPercent,
  growthStage,
  isFullyGrown,
  monthKeyOf,
  type HomeResponse,
  type MonthSnapshot,
  type PlantsResponse,
  type PlantSummary,
} from '@haruleaf/shared';
import { and, asc, count, eq, gte, lt } from 'drizzle-orm';
import type { Db } from '../db/client';
import { diaries, monthlyRecords, plants, userPlants } from '../db/schema';
import type { Clock } from '../lib/clock';
import { AppError } from '../lib/errors';

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Executor = Db | Tx;

/** 'YYYY-MM-DD' → 그 달 1일 'YYYY-MM-01' */
export function monthStartOf(date: string): string {
  return `${monthKeyOf(date)}-01`;
}

export function nextMonthStart(monthStart: string): string {
  const [year, month] = monthStart.split('-').map(Number) as [number, number];
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

function totalDaysOf(monthStart: string): number {
  const [year, month] = monthStart.split('-').map(Number) as [number, number];
  return daysInMonth(year, month);
}

export async function ensureMonth(executor: Executor, userId: string, monthStart: string): Promise<void> {
  await executor
    .insert(monthlyRecords)
    .values({ userId, month: monthStart, totalDays: totalDaysOf(monthStart) })
    .onConflictDoNothing();
}

/** 이번 달 행을 만들고 FOR UPDATE로 잠근다(같은 사용자의 동시 선택·작성 직렬화). */
export async function lockMonth(tx: Tx, userId: string, monthStart: string) {
  await ensureMonth(tx, userId, monthStart);
  const [row] = await tx
    .select()
    .from(monthlyRecords)
    .where(and(eq(monthlyRecords.userId, userId), eq(monthlyRecords.month, monthStart)))
    .for('update');
  if (!row) throw new Error('이번 달 기록을 만들지 못했습니다.');
  return row;
}

export async function monthSnapshot(db: Executor, userId: string, monthStart: string): Promise<MonthSnapshot> {
  const [record] = await db
    .select({
      totalDays: monthlyRecords.totalDays,
      selectionLocked: monthlyRecords.selectionLocked,
      plantId: plants.id,
      plantName: plants.name,
      plantKind: plants.kind,
      plantClass: plants.catalogClass,
    })
    .from(monthlyRecords)
    .leftJoin(plants, eq(plants.id, monthlyRecords.plantId))
    .where(and(eq(monthlyRecords.userId, userId), eq(monthlyRecords.month, monthStart)))
    .limit(1);
  const [written] = await db
    .select({ value: count() })
    .from(diaries)
    .where(and(eq(diaries.userId, userId), gte(diaries.diaryDate, monthStart), lt(diaries.diaryDate, nextMonthStart(monthStart))));
  const totalDays = record?.totalDays ?? totalDaysOf(monthStart);
  const writtenDays = written?.value ?? 0;
  const percent = growthPercent(writtenDays, totalDays);
  const plant: PlantSummary | null =
    record?.plantId && record.plantName && record.plantKind && record.plantClass
      ? {
          id: record.plantId,
          name: record.plantName,
          kind: record.plantKind as PlantSummary['kind'],
          catalogClass: record.plantClass as PlantSummary['catalogClass'],
        }
      : null;
  return {
    month: monthKeyOf(monthStart),
    plant,
    selectionLocked: record?.selectionLocked ?? false,
    writtenDays,
    totalDays,
    growthPercent: percent,
    growthStage: growthStage(percent),
    fullyGrown: isFullyGrown(percent),
  };
}

export async function getHome(db: Db, userId: string, clock: Clock): Promise<HomeResponse> {
  const today = clock.today();
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

export async function listPlants(db: Db, userId: string): Promise<PlantsResponse> {
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
    .where(eq(plants.isActive, true))
    .orderBy(asc(plants.sortOrder));
  return {
    plants: rows.map(({ ownerId, ...plant }) => ({
      ...plant,
      kind: plant.kind as PlantSummary['kind'],
      catalogClass: plant.catalogClass as PlantSummary['catalogClass'],
      owned: ownerId !== null,
    })),
  };
}

export async function selectPlant(db: Db, userId: string, plantId: string, clock: Clock): Promise<HomeResponse> {
  const monthStart = monthStartOf(clock.today());
  await db.transaction(async (tx) => {
    const [plant] = await tx
      .select({ id: plants.id })
      .from(plants)
      .where(and(eq(plants.id, plantId), eq(plants.isActive, true)))
      .limit(1);
    if (!plant) throw new AppError('PLANT_NOT_FOUND', '식물을 찾을 수 없어요.', 404);
    const [owned] = await tx
      .select({ plantId: userPlants.plantId })
      .from(userPlants)
      .where(and(eq(userPlants.userId, userId), eq(userPlants.plantId, plantId)))
      .limit(1);
    if (!owned) throw new AppError('PLANT_NOT_OWNED', '보유한 식물만 고를 수 있어요.', 403);
    const record = await lockMonth(tx, userId, monthStart);
    if (record.selectionLocked) throw new AppError('SELECTION_LOCKED', '첫 일기를 쓴 달은 식물을 바꿀 수 없어요.', 409);
    await tx
      .update(monthlyRecords)
      .set({ plantId })
      .where(and(eq(monthlyRecords.userId, userId), eq(monthlyRecords.month, monthStart)));
  });
  return getHome(db, userId, clock);
}
```

`apps/server/src/routes/home.ts`:

```ts
import { selectPlantSchema, type HomeResponse, type PlantsResponse } from '@haruleaf/shared';
import { getHome, listPlants, selectPlant } from '../domain/months';
import { authOf } from '../plugins/auth';
import type { ProtectedPlugin } from './protected';

export const homeRoutes: ProtectedPlugin = async (app, { db, clock }) => {
  app.get('/home', async (request): Promise<HomeResponse> => getHome(db, authOf(request).userId, clock));

  app.get('/plants', async (request): Promise<PlantsResponse> => listPlants(db, authOf(request).userId));

  app.put('/months/current/plant', async (request): Promise<HomeResponse> => {
    const { plantId } = selectPlantSchema.parse(request.body);
    return selectPlant(db, authOf(request).userId, plantId, clock);
  });
};
```

`apps/server/src/app.ts`: `import { homeRoutes } from './routes/home';` 추가, 보호 라우트 목록에 추가 → `protectedRoutes([logoutRoutes, meRoutes, homeRoutes])`.

- [ ] **Step 5: 통과 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server && npm run typecheck -w @haruleaf/server`
Expected: 전체 PASS, 타입 오류 0. (drizzle `count()`·`.for('update')`·`onConflictDoNothing()` API가 다르면 설치된 타입을 확인해 의미를 유지한 채 최소 수정하고 보고서에 기록.)

- [ ] **Step 6: 커밋**

```bash
cd ~/HaruLeaf
git add apps/server
git commit -m "feat: 이번 달 기록·성장 스냅샷과 홈·식물 목록·식물 선택 API 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 일기 작성·조회·수정·삭제 API

**Files:**
- Create: `apps/server/src/domain/diaries.ts`, `apps/server/src/routes/diaries.ts`
- Modify: `apps/server/src/app.ts`
- Test: `apps/server/test/diaries.test.ts`

**Interfaces:**
- Consumes: Task 4 `lockMonth`, `monthStartOf`, `nextMonthStart`, `Tx`; `isUniqueViolation`; Task 3 `diaryInputSchema`, `monthKeySchema`, `diaryDateSchema`, 타입; 테스트 헬퍼(Task 4)
- Produces:
  - `createDiary(db, userId, body, clock): Promise<DiaryEntry>`
  - `listDiaries(db, userId, month, clock): Promise<DiaryListResponse>`
  - `getDiary(db, userId, date, clock): Promise<DiaryResponse>`
  - `updateDiary(db, userId, date, body, clock, now?): Promise<DiaryEntry>`
  - `deleteDiary(db, userId, date, clock): Promise<void>`
  - `diaryRoutes: ProtectedPlugin` — `POST /diaries`(201), `GET /diaries?month=`, `GET|PUT|DELETE /diaries/:date`

- [ ] **Step 1: 실패하는 테스트 작성** — `apps/server/test/diaries.test.ts`

```ts
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { diaries, monthlyRecords } from '../src/db/schema';
import { seedCatalog } from '../src/db/seed';
import { bearer } from './auth-helpers';
import { createTestDb, resetDatabase } from './helpers';
import { insertDiaries, mutableClock, signupUser } from './months-helpers';

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

const choose = (token: string, plantId = 'monstera') =>
  app.inject({ method: 'PUT', url: '/months/current/plant', headers: bearer(token), payload: { plantId } });
const write = (token: string, body: unknown) =>
  app.inject({ method: 'POST', url: '/diaries', headers: bearer(token), payload: body as object });
const home = async (token: string) => (await app.inject({ method: 'GET', url: '/home', headers: bearer(token) })).json();

async function readyUser(loginId = 'haru_01') {
  const user = await signupUser(app, loginId);
  await choose(user.token);
  return user;
}

describe('POST /diaries', () => {
  it('식물을 고르지 않았으면 409이고 저장하지 않는다', async () => {
    const { token } = await signupUser(app);
    const response = await write(token, { body: '오늘' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { code: 'PLANT_NOT_SELECTED', message: '이번 달 식물을 먼저 골라주세요.' } });
    expect(await db.select().from(diaries)).toHaveLength(0);
  });

  it('서버 기준 오늘 날짜로 저장하고 식물을 고정한다', async () => {
    const { token, userId } = await readyUser();
    const response = await write(token, { body: '  오늘은\n맑았다  ', date: '2026-10-01' });
    expect(response.statusCode).toBe(201);
    expect(response.json().diary).toMatchObject({ date: '2026-10-15', body: '오늘은\n맑았다' });
    const [record] = await db
      .select()
      .from(monthlyRecords)
      .where(and(eq(monthlyRecords.userId, userId), eq(monthlyRecords.month, '2026-10-01')));
    expect(record!.selectionLocked).toBe(true);
    const snapshot = await home(token);
    expect(snapshot.writtenDays).toBe(1);
    expect(snapshot.growthPercent).toBeCloseTo(100 / 31, 5);
    expect(snapshot.todayDiary).toBe(true);
  });

  it('하루에 한 편', async () => {
    const { token } = await readyUser();
    await write(token, { body: '첫 번째' });
    const response = await write(token, { body: '두 번째' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { code: 'DIARY_EXISTS', message: '오늘 일기는 이미 있어요. 수정해주세요.' } });
  });

  it.each([
    [{ body: '' }, '일기는 1~10,000자로 써주세요.'],
    [{ body: '가'.repeat(10001) }, '일기는 1~10,000자로 써주세요.'],
    [{ body: '오늘\u0000' }, '사용할 수 없는 문자가 들어 있어요.'],
    [{}, '일기는 1~10,000자로 써주세요.'],
  ])('본문 규칙 위반 %# → 400', async (payload, message) => {
    const { token } = await readyUser();
    const response = await write(token, payload);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: 'VALIDATION_ERROR', message } });
  });
});

describe('GET /diaries', () => {
  it('이번 달 목록을 최신순으로, 오늘 날짜와 수정 가능 여부와 함께', async () => {
    const { token, userId } = await readyUser();
    await insertDiaries(db, userId, ['2026-10-01', '2026-10-03', '2026-09-30']);
    await write(token, { body: '오늘' });
    const response = await app.inject({ method: 'GET', url: '/diaries', headers: bearer(token) });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.month).toBe('2026-10');
    expect(body.today).toBe('2026-10-15');
    expect(body.editable).toBe(true);
    expect(body.diaries.map((diary: { date: string }) => diary.date)).toEqual(['2026-10-15', '2026-10-03', '2026-10-01']);
  });

  it('지난달은 읽기 전용으로 표시', async () => {
    const { token, userId } = await readyUser();
    await insertDiaries(db, userId, ['2026-09-30']);
    const body = (await app.inject({ method: 'GET', url: '/diaries?month=2026-09', headers: bearer(token) })).json();
    expect(body.editable).toBe(false);
    expect(body.diaries).toHaveLength(1);
  });

  it('잘못된 월 형식은 400', async () => {
    const { token } = await readyUser();
    const response = await app.inject({ method: 'GET', url: '/diaries?month=2026-13', headers: bearer(token) });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toBe('월 형식이 올바르지 않아요.');
  });

  it('다른 사용자의 일기는 보이지 않는다', async () => {
    const a = await readyUser('haru_01');
    const b = await readyUser('haru_02');
    await write(a.token, { body: 'A의 일기' });
    const list = (await app.inject({ method: 'GET', url: '/diaries', headers: bearer(b.token) })).json();
    expect(list.diaries).toHaveLength(0);
    const detail = await app.inject({ method: 'GET', url: '/diaries/2026-10-15', headers: bearer(b.token) });
    expect(detail.statusCode).toBe(404);
    expect(detail.json()).toEqual({ error: { code: 'DIARY_NOT_FOUND', message: '일기를 찾을 수 없어요.' } });
  });
});

describe('GET /diaries/:date', () => {
  it('상세와 수정 가능 여부', async () => {
    const { token } = await readyUser();
    await write(token, { body: '오늘' });
    const response = await app.inject({ method: 'GET', url: '/diaries/2026-10-15', headers: bearer(token) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ editable: true, diary: { date: '2026-10-15', body: '오늘' } });
  });

  it('존재하지 않는 날짜 형식은 400', async () => {
    const { token } = await readyUser();
    const response = await app.inject({ method: 'GET', url: '/diaries/2026-02-30', headers: bearer(token) });
    expect(response.statusCode).toBe(400);
  });
});

describe('PUT·DELETE /diaries/:date', () => {
  it('수정은 작성일수를 바꾸지 않는다', async () => {
    const { token } = await readyUser();
    await write(token, { body: '처음' });
    const response = await app.inject({ method: 'PUT', url: '/diaries/2026-10-15', headers: bearer(token), payload: { body: '고친 글' } });
    expect(response.statusCode).toBe(200);
    expect(response.json().diary.body).toBe('고친 글');
    expect((await home(token)).writtenDays).toBe(1);
  });

  it('삭제하면 성장률이 줄지만 식물 고정은 유지된다', async () => {
    const { token } = await readyUser();
    await write(token, { body: '오늘' });
    const response = await app.inject({ method: 'DELETE', url: '/diaries/2026-10-15', headers: bearer(token) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    const snapshot = await home(token);
    expect(snapshot.writtenDays).toBe(0);
    expect(snapshot.selectionLocked).toBe(true);
    expect((await choose(token, 'rose')).statusCode).toBe(409);
  });

  it('없는 일기는 404', async () => {
    const { token } = await readyUser();
    expect((await app.inject({ method: 'DELETE', url: '/diaries/2026-10-14', headers: bearer(token) })).statusCode).toBe(404);
  });

  it('달이 바뀌면 지난달 일기는 읽기 전용이고 새 달은 식물을 새로 골라야 한다', async () => {
    const { token } = await readyUser();
    await write(token, { body: '10월의 기록' });
    clock.set('2026-11-01');
    const closed = { error: { code: 'MONTH_CLOSED', message: '지난달 기록은 읽기 전용이에요.' } };
    const edit = await app.inject({ method: 'PUT', url: '/diaries/2026-10-15', headers: bearer(token), payload: { body: '고침' } });
    expect(edit.statusCode).toBe(403);
    expect(edit.json()).toEqual(closed);
    const remove = await app.inject({ method: 'DELETE', url: '/diaries/2026-10-15', headers: bearer(token) });
    expect(remove.statusCode).toBe(403);
    const detail = (await app.inject({ method: 'GET', url: '/diaries/2026-10-15', headers: bearer(token) })).json();
    expect(detail.editable).toBe(false);
    expect((await write(token, { body: '11월' })).json().error.code).toBe('PLANT_NOT_SELECTED');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server -- test/diaries.test.ts`
Expected: FAIL — `/diaries` 404.

- [ ] **Step 3: 구현**

`apps/server/src/domain/diaries.ts`:

```ts
import { monthKeyOf, type DiaryEntry, type DiaryListResponse, type DiaryResponse } from '@haruleaf/shared';
import { and, desc, eq, gte, lt } from 'drizzle-orm';
import type { Db } from '../db/client';
import { diaries, monthlyRecords } from '../db/schema';
import type { Clock } from '../lib/clock';
import { isUniqueViolation } from '../lib/db-errors';
import { AppError } from '../lib/errors';
import { lockMonth, monthStartOf, nextMonthStart } from './months';

function toEntry(row: typeof diaries.$inferSelect): DiaryEntry {
  return {
    date: row.diaryDate,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const notFound = () => new AppError('DIARY_NOT_FOUND', '일기를 찾을 수 없어요.', 404);

function isCurrentMonth(date: string, clock: Clock): boolean {
  return monthKeyOf(date) === monthKeyOf(clock.today());
}

function assertEditable(date: string, clock: Clock): void {
  if (!isCurrentMonth(date, clock)) throw new AppError('MONTH_CLOSED', '지난달 기록은 읽기 전용이에요.', 403);
}

export async function createDiary(db: Db, userId: string, body: string, clock: Clock): Promise<DiaryEntry> {
  const today = clock.today();
  const monthStart = monthStartOf(today);
  try {
    return await db.transaction(async (tx) => {
      const record = await lockMonth(tx, userId, monthStart);
      if (!record.plantId) throw new AppError('PLANT_NOT_SELECTED', '이번 달 식물을 먼저 골라주세요.', 409);
      const [row] = await tx.insert(diaries).values({ userId, diaryDate: today, body }).returning();
      if (!row) throw new Error('일기 저장 결과가 비어 있습니다.');
      if (!record.selectionLocked) {
        await tx
          .update(monthlyRecords)
          .set({ selectionLocked: true })
          .where(and(eq(monthlyRecords.userId, userId), eq(monthlyRecords.month, monthStart)));
      }
      return toEntry(row);
    });
  } catch (error) {
    if (isUniqueViolation(error, 'diaries_user_date_unique')) {
      throw new AppError('DIARY_EXISTS', '오늘 일기는 이미 있어요. 수정해주세요.', 409);
    }
    throw error;
  }
}

export async function listDiaries(db: Db, userId: string, month: string, clock: Clock): Promise<DiaryListResponse> {
  const monthStart = `${month}-01`;
  const rows = await db
    .select()
    .from(diaries)
    .where(and(eq(diaries.userId, userId), gte(diaries.diaryDate, monthStart), lt(diaries.diaryDate, nextMonthStart(monthStart))))
    .orderBy(desc(diaries.diaryDate));
  const today = clock.today();
  return { month, today, editable: month === monthKeyOf(today), diaries: rows.map(toEntry) };
}

export async function getDiary(db: Db, userId: string, date: string, clock: Clock): Promise<DiaryResponse> {
  const [row] = await db
    .select()
    .from(diaries)
    .where(and(eq(diaries.userId, userId), eq(diaries.diaryDate, date)))
    .limit(1);
  if (!row) throw notFound();
  return { diary: toEntry(row), editable: isCurrentMonth(date, clock) };
}

export async function updateDiary(
  db: Db,
  userId: string,
  date: string,
  body: string,
  clock: Clock,
  now = new Date(),
): Promise<DiaryEntry> {
  assertEditable(date, clock);
  const [row] = await db
    .update(diaries)
    .set({ body, updatedAt: now })
    .where(and(eq(diaries.userId, userId), eq(diaries.diaryDate, date)))
    .returning();
  if (!row) throw notFound();
  return toEntry(row);
}

export async function deleteDiary(db: Db, userId: string, date: string, clock: Clock): Promise<void> {
  assertEditable(date, clock);
  const deleted = await db
    .delete(diaries)
    .where(and(eq(diaries.userId, userId), eq(diaries.diaryDate, date)))
    .returning({ id: diaries.id });
  if (deleted.length === 0) throw notFound();
}
```

`apps/server/src/routes/diaries.ts`:

```ts
import {
  diaryDateSchema,
  diaryInputSchema,
  monthKeyOf,
  monthKeySchema,
  type DiaryListResponse,
  type DiaryMutationResponse,
  type DiaryResponse,
  type OkResponse,
} from '@haruleaf/shared';
import { createDiary, deleteDiary, getDiary, listDiaries, updateDiary } from '../domain/diaries';
import { authOf } from '../plugins/auth';
import type { ProtectedPlugin } from './protected';

type DateParams = { Params: { date: string } };

export const diaryRoutes: ProtectedPlugin = async (app, { db, clock }) => {
  app.post('/diaries', async (request, reply) => {
    const { body } = diaryInputSchema.parse(request.body);
    const diary = await createDiary(db, authOf(request).userId, body, clock);
    const response: DiaryMutationResponse = { diary };
    return reply.status(201).send(response);
  });

  app.get('/diaries', async (request): Promise<DiaryListResponse> => {
    const { month } = request.query as { month?: string };
    const key = month === undefined ? monthKeyOf(clock.today()) : monthKeySchema.parse(month);
    return listDiaries(db, authOf(request).userId, key, clock);
  });

  app.get<DateParams>('/diaries/:date', async (request): Promise<DiaryResponse> => {
    const date = diaryDateSchema.parse(request.params.date);
    return getDiary(db, authOf(request).userId, date, clock);
  });

  app.put<DateParams>('/diaries/:date', async (request): Promise<DiaryMutationResponse> => {
    const date = diaryDateSchema.parse(request.params.date);
    const { body } = diaryInputSchema.parse(request.body);
    return { diary: await updateDiary(db, authOf(request).userId, date, body, clock) };
  });

  app.delete<DateParams>('/diaries/:date', async (request): Promise<OkResponse> => {
    const date = diaryDateSchema.parse(request.params.date);
    await deleteDiary(db, authOf(request).userId, date, clock);
    return { ok: true };
  });
};
```

`apps/server/src/app.ts`: `import { diaryRoutes } from './routes/diaries';` 추가 → `protectedRoutes([logoutRoutes, meRoutes, homeRoutes, diaryRoutes])`.

- [ ] **Step 4: 통과 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server && npm run typecheck -w @haruleaf/server`
Expected: 전체 PASS, 타입 오류 0. (`[{}, …]` 케이스에서 zod가 "입력값을 확인해주세요." 같은 다른 메시지를 내면, 누락 필드 메시지가 일기 본문 메시지가 되도록 스키마 쪽을 맞추고 보고서에 기록.)

- [ ] **Step 5: 커밋**

```bash
cd ~/HaruLeaf
git add apps/server
git commit -m "feat: 일기 작성·조회·수정·삭제 API 추가 — 서버 기준 날짜, 이번 달만 수정, 첫 일기 시 식물 고정

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 앱 데이터 계층·식물 그림·진행 바

**Files:**
- Create: `scripts/png.mjs`, `scripts/png.test.mjs`, `scripts/generate-placeholder-plants.mjs`
- Create (생성물): `apps/app/assets/plants/{monstera,rose,sunflower,tulip,lavender,_default}/stage-{1..5}.png`
- Modify: 루트 `package.json` (스크립트 추가)
- Create: `apps/app/src/api/diary.ts`, `apps/app/src/hooks/useRemoteData.ts`, `apps/app/src/components/plant-images.ts`, `PlantImage.tsx`, `ProgressBar.tsx`

**Interfaces:**
- Consumes: Task 3 타입; 서버 API(Task 4·5); 앱 `apiRequest`, `ApiError`
- Produces (Task 7·8이 사용):
  - `fetchHome()`, `fetchPlants()`, `selectPlantRequest(input)`, `fetchDiaries(month?)`, `fetchDiary(date)`, `createDiaryRequest(input)`, `updateDiaryRequest(date, input)`, `deleteDiaryRequest(date)`
  - `useRemoteData<T>(load: () => Promise<T>): { state: RemoteState<T>; reload(): void }`, `type RemoteState<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; message: string }` — 화면 포커스마다 다시 불러옴
  - `plantImage(plantId: string, stage: GrowthStage): ImageSourcePropType`
  - `<PlantImage plantId stage size? accessibilityLabel />` (단계·식물 변경 시 페이드 인)
  - `<ProgressBar percent />`
  - PNG 도구: `encodePng(width, height, rgba: Uint8Array): Buffer`

- [ ] **Step 1: PNG 인코더 실패 테스트** — `scripts/png.test.mjs`

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodePng } from './png.mjs';

test('PNG 시그니처와 IHDR 크기를 쓴다', () => {
  const rgba = new Uint8Array(4 * 3 * 2).fill(255);
  const png = encodePng(3, 2, rgba);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.subarray(12, 16).toString('ascii'), 'IHDR');
  assert.equal(png.readUInt32BE(16), 3);
  assert.equal(png.readUInt32BE(20), 2);
  assert.equal(png[24], 8); // bit depth
  assert.equal(png[25], 6); // RGBA
  assert.equal(png.subarray(png.length - 8, png.length - 4).toString('ascii'), 'IEND');
});

test('픽셀 수가 맞지 않으면 오류', () => {
  assert.throws(() => encodePng(2, 2, new Uint8Array(4)), /RGBA/);
});
```

Run: `cd ~/HaruLeaf && node --test scripts/png.test.mjs`
Expected: FAIL — `./png.mjs` 없음.

- [ ] **Step 2: PNG 인코더와 임시 그림 생성기 작성**

`scripts/png.mjs`:

```js
import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** RGBA 8bit 비압축 픽셀 배열을 PNG로 인코딩한다(외부 의존성 없음). */
export function encodePng(width, height, rgba) {
  if (rgba.length !== width * height * 4) throw new Error('RGBA 픽셀 수가 크기와 맞지 않습니다.');
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // color type RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
```

`scripts/generate-placeholder-plants.mjs`:

```js
// 실제 식물 이미지가 오기 전까지 쓰는 임시 성장 단계 그림(투명 배경 512×512)을 만든다.
// 사용자가 제공한 이미지로 같은 경로의 파일을 덮어쓰면 된다.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { encodePng } from './png.mjs';

const SIZE = 512;
const OUT_DIR = fileURLToPath(new URL('../apps/app/assets/plants/', import.meta.url));

const PLANTS = {
  monstera: { leaf: '#3E7651', flower: null },
  rose: { leaf: '#4F7A4B', flower: '#C6667E' },
  sunflower: { leaf: '#5B7F3A', flower: '#D8AA32' },
  tulip: { leaf: '#4E7C55', flower: '#CB7F98' },
  lavender: { leaf: '#5E7F5A', flower: '#8873B2' },
  _default: { leaf: '#6B8F71', flower: '#B9C7B4' },
};

const POT = '#B07A54';
const SOIL = '#6E4B33';

function hex(color) {
  const value = Number.parseInt(color.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
}

function canvas() {
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  const set = (x, y, rgba) => {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    pixels.set(rgba, (y * SIZE + x) * 4);
  };
  return {
    pixels,
    rect(x0, y0, x1, y1, color) {
      const rgba = hex(color);
      for (let y = Math.round(y0); y < y1; y += 1) for (let x = Math.round(x0); x < x1; x += 1) set(x, y, rgba);
    },
    ellipse(cx, cy, rx, ry, color) {
      const rgba = hex(color);
      for (let y = Math.floor(cy - ry); y <= cy + ry; y += 1) {
        for (let x = Math.floor(cx - rx); x <= cx + rx; x += 1) {
          if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) set(x, y, rgba);
        }
      }
    },
    trapezoid(cx, yTop, yBottom, topHalf, bottomHalf, color) {
      const rgba = hex(color);
      for (let y = yTop; y < yBottom; y += 1) {
        const t = (y - yTop) / (yBottom - yTop);
        const half = topHalf + (bottomHalf - topHalf) * t;
        for (let x = Math.round(cx - half); x < cx + half; x += 1) set(x, y, rgba);
      }
    },
  };
}

function drawStage(plant, stage) {
  const c = canvas();
  const cx = SIZE / 2;
  // 화분과 흙: 모든 단계에서 같은 위치(단계 전환 시 겹쳐도 튀지 않게)
  c.trapezoid(cx, 380, 480, 110, 80, POT);
  c.rect(cx - 118, 370, cx + 118, 392, POT);
  c.ellipse(cx, 384, 104, 12, SOIL);

  const stemHeight = [0, 40, 110, 170, 220, 250][stage];
  const stemTop = 384 - stemHeight;
  c.rect(cx - 5, stemTop, cx + 5, 384, plant.leaf);

  const leafPairs = [0, 1, 2, 3, 3, 4][stage];
  for (let i = 0; i < leafPairs; i += 1) {
    const y = 370 - (i + 1) * (stemHeight / (leafPairs + 1));
    const size = 18 + stage * 6 - i * 3;
    c.ellipse(cx - size - 4, y, size, size * 0.55, plant.leaf);
    c.ellipse(cx + size + 4, y - 6, size, size * 0.55, plant.leaf);
  }

  if (stage === 4 && plant.flower) c.ellipse(cx, stemTop - 10, 16, 22, plant.flower);
  if (stage === 5) {
    if (plant.flower) {
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI * 2 * i) / 6;
        c.ellipse(cx + Math.cos(angle) * 30, stemTop - 20 + Math.sin(angle) * 30, 24, 24, plant.flower);
      }
      c.ellipse(cx, stemTop - 20, 18, 18, '#E8C547');
    } else {
      c.ellipse(cx, stemTop - 10, 70, 46, plant.leaf);
    }
  }
  return c.pixels;
}

for (const [id, plant] of Object.entries(PLANTS)) {
  const dir = `${OUT_DIR}${id}`;
  mkdirSync(dir, { recursive: true });
  for (let stage = 1; stage <= 5; stage += 1) {
    writeFileSync(`${dir}/stage-${stage}.png`, encodePng(SIZE, SIZE, drawStage(plant, stage)));
  }
}
console.log(`임시 식물 그림 ${Object.keys(PLANTS).length * 5}장을 만들었습니다: ${OUT_DIR}`);
```

루트 `package.json`의 `scripts`에 추가: `"assets:placeholder-plants": "node scripts/generate-placeholder-plants.mjs"`

Run:
```bash
cd ~/HaruLeaf
node --test scripts/png.test.mjs
npm run assets:placeholder-plants
ls apps/app/assets/plants/*/ | head -40
```
Expected: 테스트 PASS, "임시 식물 그림 30장을 만들었습니다", 6개 폴더에 `stage-1.png`~`stage-5.png`.

- [ ] **Step 3: API 함수와 데이터 훅**

`apps/app/src/api/diary.ts`:

```ts
import type {
  DiaryInput,
  DiaryListResponse,
  DiaryMutationResponse,
  DiaryResponse,
  HomeResponse,
  OkResponse,
  PlantsResponse,
  SelectPlantInput,
} from '@haruleaf/shared';
import { apiRequest } from './client';

export const fetchHome = () => apiRequest<HomeResponse>('/home');

export const fetchPlants = () => apiRequest<PlantsResponse>('/plants');

export const selectPlantRequest = (input: SelectPlantInput) =>
  apiRequest<HomeResponse>('/months/current/plant', { method: 'PUT', body: input });

export const fetchDiaries = (month?: string) =>
  apiRequest<DiaryListResponse>(month ? `/diaries?month=${encodeURIComponent(month)}` : '/diaries');

export const fetchDiary = (date: string) => apiRequest<DiaryResponse>(`/diaries/${encodeURIComponent(date)}`);

export const createDiaryRequest = (input: DiaryInput) =>
  apiRequest<DiaryMutationResponse>('/diaries', { method: 'POST', body: input });

export const updateDiaryRequest = (date: string, input: DiaryInput) =>
  apiRequest<DiaryMutationResponse>(`/diaries/${encodeURIComponent(date)}`, { method: 'PUT', body: input });

export const deleteDiaryRequest = (date: string) =>
  apiRequest<OkResponse>(`/diaries/${encodeURIComponent(date)}`, { method: 'DELETE' });
```

`apps/app/src/hooks/useRemoteData.ts`:

```ts
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ApiError } from '@/api/client';

export type RemoteState<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; message: string };

/**
 * 화면이 포커스될 때마다(다른 화면에서 돌아올 때 포함) 데이터를 다시 불러온다.
 * load는 안정적인 함수여야 한다(모듈 함수 또는 useCallback).
 */
export function useRemoteData<T>(load: () => Promise<T>): { state: RemoteState<T>; reload: () => void } {
  const [state, setState] = useState<RemoteState<T>>({ status: 'loading' });
  const [version, setVersion] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load()
        .then((data) => {
          if (active) setState({ status: 'ready', data });
        })
        .catch((error: unknown) => {
          if (active) setState({ status: 'error', message: error instanceof ApiError ? error.message : '불러오지 못했어요.' });
        });
      return () => {
        active = false;
      };
      // version이 바뀌면 다시 불러온다(reload).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, version]),
  );

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { state, reload };
}
```

(만약 lint가 위 eslint-disable 주석 없이도 통과하면 주석을 지운다. 규칙을 끄는 주석은 이 한 줄만 허용.)

- [ ] **Step 4: 식물 그림·진행 바 컴포넌트**

`apps/app/src/components/plant-images.ts`:

```ts
import type { GrowthStage } from '@haruleaf/shared';
import type { ImageSourcePropType } from 'react-native';

type StageImages = Record<GrowthStage, ImageSourcePropType>;

// 실제 이미지로 교체할 때는 같은 경로의 파일만 바꾸면 된다. 새 식물은 여기에 한 줄 추가.
const PLANT_IMAGES: Record<string, StageImages> = {
  monstera: {
    1: require('@/assets/plants/monstera/stage-1.png'),
    2: require('@/assets/plants/monstera/stage-2.png'),
    3: require('@/assets/plants/monstera/stage-3.png'),
    4: require('@/assets/plants/monstera/stage-4.png'),
    5: require('@/assets/plants/monstera/stage-5.png'),
  },
  rose: {
    1: require('@/assets/plants/rose/stage-1.png'),
    2: require('@/assets/plants/rose/stage-2.png'),
    3: require('@/assets/plants/rose/stage-3.png'),
    4: require('@/assets/plants/rose/stage-4.png'),
    5: require('@/assets/plants/rose/stage-5.png'),
  },
  sunflower: {
    1: require('@/assets/plants/sunflower/stage-1.png'),
    2: require('@/assets/plants/sunflower/stage-2.png'),
    3: require('@/assets/plants/sunflower/stage-3.png'),
    4: require('@/assets/plants/sunflower/stage-4.png'),
    5: require('@/assets/plants/sunflower/stage-5.png'),
  },
  tulip: {
    1: require('@/assets/plants/tulip/stage-1.png'),
    2: require('@/assets/plants/tulip/stage-2.png'),
    3: require('@/assets/plants/tulip/stage-3.png'),
    4: require('@/assets/plants/tulip/stage-4.png'),
    5: require('@/assets/plants/tulip/stage-5.png'),
  },
  lavender: {
    1: require('@/assets/plants/lavender/stage-1.png'),
    2: require('@/assets/plants/lavender/stage-2.png'),
    3: require('@/assets/plants/lavender/stage-3.png'),
    4: require('@/assets/plants/lavender/stage-4.png'),
    5: require('@/assets/plants/lavender/stage-5.png'),
  },
};

const DEFAULT_IMAGES: StageImages = {
  1: require('@/assets/plants/_default/stage-1.png'),
  2: require('@/assets/plants/_default/stage-2.png'),
  3: require('@/assets/plants/_default/stage-3.png'),
  4: require('@/assets/plants/_default/stage-4.png'),
  5: require('@/assets/plants/_default/stage-5.png'),
};

export function plantImage(plantId: string, stage: GrowthStage): ImageSourcePropType {
  return (PLANT_IMAGES[plantId] ?? DEFAULT_IMAGES)[stage];
}
```

`apps/app/src/components/PlantImage.tsx`:

```tsx
import type { GrowthStage } from '@haruleaf/shared';
import { useEffect, useState } from 'react';
import { Animated, Platform, type ImageSourcePropType } from 'react-native';
import { plantImage } from './plant-images';

type Props = { plantId: string; stage: GrowthStage; size?: number; accessibilityLabel: string };

/** 식물·단계가 바뀌면 새 그림이 서서히 나타난다(Fade, 명세서 SYS-08). */
export function PlantImage({ plantId, stage, size = 200, accessibilityLabel }: Props) {
  return (
    <FadeInImage
      key={`${plantId}-${stage}`}
      source={plantImage(plantId, stage)}
      size={size}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

function FadeInImage({ source, size, accessibilityLabel }: { source: ImageSourcePropType; size: number; accessibilityLabel: string }) {
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [opacity]);
  return (
    <Animated.Image
      source={source}
      style={{ width: size, height: size, opacity, alignSelf: 'center' }}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    />
  );
}
```

`apps/app/src/components/ProgressBar.tsx`:

```tsx
import { StyleSheet, View } from 'react-native';
import { colors, radius } from '@/theme/tokens';

export function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}>
      <View style={[styles.fill, { width: `${clamped}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 12, borderRadius: radius.sm, backgroundColor: colors.primarySoft, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.primary, borderRadius: radius.sm },
});
```

- [ ] **Step 5: 검증**

Run:
```bash
cd ~/HaruLeaf
npm run typecheck && npm run lint && npm test
cd apps/app && npx expo export --platform web --output-dir "$TMPDIR/haruleaf-web-export" && ls "$TMPDIR/haruleaf-web-export/assets" | head; rm -rf "$TMPDIR/haruleaf-web-export"
```
Expected: 타입·lint 오류 0, 전체 테스트 PASS(루트 test에 `scripts/*.test.mjs` 포함), web export 성공(식물 PNG가 번들 자산으로 포함됨).

- [ ] **Step 6: 커밋**

```bash
cd ~/HaruLeaf
git add scripts package.json apps/app/assets/plants apps/app/src/api/diary.ts apps/app/src/hooks apps/app/src/components/plant-images.ts apps/app/src/components/PlantImage.tsx apps/app/src/components/ProgressBar.tsx
git commit -m "feat: 앱 일기·홈 API 함수, 포커스 재조회 훅, 식물 그림(임시 PNG 30장)·진행 바 컴포넌트 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 홈·식물 선택 화면

**Files:**
- Modify: `apps/app/src/app/(main)/_layout.tsx`, `apps/app/src/app/(main)/index.tsx` (교체)
- Create: `apps/app/src/app/(main)/plants.tsx`, `apps/app/src/app/(main)/entry/write.tsx`(이번 작업은 자리표시), `apps/app/src/app/(main)/entry/[date].tsx`(자리표시)

**Interfaces:**
- Consumes: Task 6 API·훅·컴포넌트; shared `formatGrowthPercent`, `formatMonthLabel`; `useCurrentUser`
- Produces: 라우트 `/plants`, `/entry/write`(`?date=` 수정 모드), `/entry/[date]` — 탭 바에 표시하지 않음(`href: null`), 탭 `backBehavior="history"`

- [ ] **Step 1: 탭 레이아웃 수정** — `apps/app/src/app/(main)/_layout.tsx` 전체 교체

```tsx
import { Tabs } from 'expo-router';
import { colors } from '@/theme/tokens';

export default function MainLayout() {
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}>
      <Tabs.Screen name="index" options={{ title: '홈' }} />
      <Tabs.Screen name="diary" options={{ title: '일기' }} />
      <Tabs.Screen name="garden" options={{ title: '정원' }} />
      <Tabs.Screen name="shop" options={{ title: '상점' }} />
      <Tabs.Screen name="profile" options={{ title: '프로필' }} />
      <Tabs.Screen name="plants" options={{ href: null, title: '식물 고르기' }} />
      <Tabs.Screen name="entry/write" options={{ href: null, title: '일기 쓰기' }} />
      <Tabs.Screen name="entry/[date]" options={{ href: null, title: '일기' }} />
    </Tabs>
  );
}
```

`apps/app/src/app/(main)/entry/write.tsx`·`entry/[date].tsx`는 Task 8에서 채운다. 지금은 라우트가 존재하도록 자리표시만:

```tsx
import { Placeholder } from '@/components/Placeholder';

export default function DiaryWriteScreen() {
  return <Placeholder title="일기 쓰기" description="다음 작업에서 구현합니다." />;
}
```

```tsx
import { Placeholder } from '@/components/Placeholder';

export default function DiaryDetailScreen() {
  return <Placeholder title="일기" description="다음 작업에서 구현합니다." />;
}
```

- [ ] **Step 2: 홈 화면** — `apps/app/src/app/(main)/index.tsx` 전체 교체

```tsx
import { formatGrowthPercent, formatMonthLabel, type HomeResponse } from '@haruleaf/shared';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { fetchHome } from '@/api/diary';
import { useCurrentUser } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/FormMessage';
import { PlantImage } from '@/components/PlantImage';
import { ProgressBar } from '@/components/ProgressBar';
import { Screen } from '@/components/Screen';
import { useRemoteData } from '@/hooks/useRemoteData';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

export default function HomeScreen() {
  const user = useCurrentUser();
  const { state, reload } = useRemoteData(fetchHome);
  if (!user) return null;
  return (
    <Screen>
      <Text style={styles.greeting} accessibilityRole="header">
        {user.nickname}님 오늘도 한 잎을 남겨볼까요?
      </Text>
      {state.status === 'loading' && <Text style={styles.muted}>불러오는 중…</Text>}
      {state.status === 'error' && (
        <>
          <FormMessage tone="error" message={state.message} />
          <Button title="다시 시도" variant="secondary" onPress={reload} />
        </>
      )}
      {state.status === 'ready' && <HomeBody home={state.data} />}
    </Screen>
  );
}

function HomeBody({ home }: { home: HomeResponse }) {
  if (!home.plant) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>이번 달 키울 식물을 골라주세요</Text>
        <Text style={styles.muted}>{formatMonthLabel(home.month)} 한 달 동안 일기를 쓴 만큼 자라요.</Text>
        <Button title="식물 고르기" onPress={() => router.push('/plants')} />
      </View>
    );
  }
  const percent = formatGrowthPercent(home.growthPercent);
  return (
    <View style={styles.card}>
      <Text style={styles.muted}>{formatMonthLabel(home.month)}의 식물</Text>
      <PlantImage
        plantId={home.plant.id}
        stage={home.growthStage}
        size={220}
        accessibilityLabel={`${home.plant.name}, 성장 ${home.growthStage}단계`}
      />
      <Text style={styles.plantName}>{home.plant.name}</Text>
      <ProgressBar percent={home.growthPercent} />
      <Text style={styles.progressText}>
        {percent}% · {home.writtenDays}/{home.totalDays}일
      </Text>
      {home.fullyGrown && <Text style={styles.grown}>완전히 자랐어요!</Text>}
      {home.todayDiary ? (
        <Button title="오늘 일기 보기" onPress={() => router.push(`/entry/${home.today}`)} />
      ) : (
        <Button title="오늘 일기 쓰기" onPress={() => router.push('/entry/write')} />
      )}
      {!home.selectionLocked && <Button title="식물 바꾸기" variant="secondary" onPress={() => router.push('/plants')} />}
    </View>
  );
}

const styles = StyleSheet.create({
  greeting: { fontSize: fontSize.title, fontWeight: '700', color: colors.text, lineHeight: 36 },
  muted: { fontSize: fontSize.body, color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  cardTitle: { fontSize: fontSize.heading, fontWeight: '700', color: colors.text },
  plantName: { fontSize: fontSize.heading, fontWeight: '700', color: colors.text, textAlign: 'center' },
  progressText: { fontSize: fontSize.body, color: colors.text, textAlign: 'center' },
  grown: { fontSize: fontSize.body, fontWeight: '700', color: colors.primary, textAlign: 'center' },
});
```

- [ ] **Step 3: 식물 선택 화면** — `apps/app/src/app/(main)/plants.tsx`

```tsx
import type { CatalogPlant } from '@haruleaf/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '@/api/client';
import { fetchHome, fetchPlants, selectPlantRequest } from '@/api/diary';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/FormMessage';
import { PlantImage } from '@/components/PlantImage';
import { Screen } from '@/components/Screen';
import { useRemoteData } from '@/hooks/useRemoteData';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

function lockedReason(plant: CatalogPlant): string {
  return plant.catalogClass === 'STANDARD' ? '꾸준히 기록하면 해금' : '상점에서 만나요';
}

export default function PlantsScreen() {
  const plants = useRemoteData(fetchPlants);
  const home = useRemoteData(fetchHome);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function choose(plantId: string) {
    if (saving) return;
    setSaving(plantId);
    setMessage(null);
    try {
      await selectPlantRequest({ plantId });
      router.replace('/');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : '식물을 고르지 못했어요.');
      setSaving(null);
    }
  }

  const locked = home.state.status === 'ready' && home.state.data.selectionLocked;
  const currentId = home.state.status === 'ready' ? home.state.data.plant?.id : undefined;

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        이번 달 식물 고르기
      </Text>
      {locked && <FormMessage tone="success" message="첫 일기를 써서 이번 달 식물이 정해졌어요." />}
      {message && <FormMessage tone="error" message={message} />}
      {plants.state.status === 'loading' && <Text style={styles.muted}>불러오는 중…</Text>}
      {plants.state.status === 'error' && (
        <>
          <FormMessage tone="error" message={plants.state.message} />
          <Button title="다시 시도" variant="secondary" onPress={plants.reload} />
        </>
      )}
      {plants.state.status === 'ready' && (
        <View style={styles.grid}>
          {plants.state.data.plants.map((plant) => (
            <View key={plant.id} style={[styles.card, !plant.owned && styles.cardLocked]}>
              <PlantImage plantId={plant.id} stage={5} size={96} accessibilityLabel={plant.name} />
              <Text style={styles.name}>{plant.name}</Text>
              <Text style={styles.description}>{plant.description}</Text>
              {plant.owned ? (
                <Button
                  title={plant.id === currentId ? '선택됨' : '이 식물로 할래요'}
                  variant={plant.id === currentId ? 'secondary' : 'primary'}
                  onPress={() => void choose(plant.id)}
                  loading={saving === plant.id}
                  disabled={locked || plant.id === currentId}
                />
              ) : (
                <Text style={styles.lockText}>{lockedReason(plant)}</Text>
              )}
            </View>
          ))}
        </View>
      )}
      <Button title="돌아가기" variant="secondary" onPress={() => router.replace('/')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  muted: { fontSize: fontSize.body, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: {
    flexBasis: 160,
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardLocked: { opacity: 0.6 },
  name: { fontSize: fontSize.body, fontWeight: '700', color: colors.text, textAlign: 'center' },
  description: { fontSize: fontSize.caption, color: colors.textMuted, textAlign: 'center' },
  lockText: { fontSize: fontSize.caption, fontWeight: '600', color: colors.textMuted, textAlign: 'center' },
});
```

- [ ] **Step 4: 검증**

Run: `cd ~/HaruLeaf && npm run typecheck && npm run lint`
Expected: 오류 0.

Web 확인(`npm run db:up`, `npm run dev` 백그라운드, 브라우저 도구가 있으면 사용): 새 계정 가입 → 홈에 "이번 달 키울 식물을 골라주세요" → [식물 고르기] → 9종 격자, 보유 5종만 버튼, 수국·데이지 "꾸준히 기록하면 해금", 달빛 꽃·안스리움 "상점에서 만나요" → 몬스테라 선택 → 홈에 몬스테라 그림·"0.0% · 0/31일"(10월 기준)·[오늘 일기 쓰기]·[식물 바꾸기]. 콘솔 오류 0. 확인 후 종료, 포트 4000·8081 비움.

- [ ] **Step 5: 커밋**

```bash
cd ~/HaruLeaf
git add apps/app/src/app
git commit -m "feat: 홈(이번 달 식물·성장률·진행 바)과 식물 선택 화면 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 일기 목록·쓰기·상세 화면

**Files:**
- Modify (교체): `apps/app/src/app/(main)/diary.tsx`, `apps/app/src/app/(main)/entry/write.tsx`, `apps/app/src/app/(main)/entry/[date].tsx`

**Interfaces:**
- Consumes: Task 6 API·훅; Task 7 라우트; shared `diaryInputSchema`, `DIARY_BODY_MAX`, `formatMonthLabel`, `shiftMonth`; 컴포넌트 `Button`, `FormMessage`, `ConfirmModal`, `Screen`

- [ ] **Step 1: 일기 목록(탭)** — `apps/app/src/app/(main)/diary.tsx`

```tsx
import { formatMonthLabel, shiftMonth, type DiaryEntry } from '@haruleaf/shared';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchDiaries } from '@/api/diary';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/FormMessage';
import { Screen } from '@/components/Screen';
import { useRemoteData } from '@/hooks/useRemoteData';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

function firstLine(body: string): string {
  const line = body.split('\n')[0] ?? '';
  return line.length > 40 ? `${line.slice(0, 40)}…` : line;
}

function dayLabel(date: string): string {
  return `${Number(date.slice(8, 10))}일`;
}

export default function DiaryListScreen() {
  // null = 서버 기준 이번 달
  const [month, setMonth] = useState<string | null>(null);
  const load = useCallback(() => fetchDiaries(month ?? undefined), [month]);
  const { state, reload } = useRemoteData(load);

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        일기
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
          <View style={styles.monthRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="이전 달"
              onPress={() => setMonth(shiftMonth(state.data.month, -1))}
              style={styles.monthButton}>
              <Text style={styles.monthArrow}>◀</Text>
            </Pressable>
            <Text style={styles.monthLabel}>{formatMonthLabel(state.data.month)}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="다음 달"
              accessibilityState={{ disabled: state.data.editable }}
              disabled={state.data.editable}
              onPress={() => setMonth(shiftMonth(state.data.month, 1))}
              style={[styles.monthButton, state.data.editable && styles.monthButtonDisabled]}>
              <Text style={styles.monthArrow}>▶</Text>
            </Pressable>
          </View>
          {!state.data.editable && <Text style={styles.badge}>읽기 전용</Text>}
          {state.data.editable && !state.data.diaries.some((diary) => diary.date === state.data.today) && (
            <Button title="오늘 일기 쓰기" onPress={() => router.push('/entry/write')} />
          )}
          {state.data.diaries.length === 0 ? (
            <Text style={styles.muted}>이 달에 쓴 일기가 없어요.</Text>
          ) : (
            state.data.diaries.map((diary: DiaryEntry) => (
              <Pressable
                key={diary.date}
                accessibilityRole="button"
                accessibilityLabel={`${dayLabel(diary.date)} 일기`}
                onPress={() => router.push(`/entry/${diary.date}`)}
                style={styles.item}>
                <Text style={styles.itemDate}>{dayLabel(diary.date)}</Text>
                <Text style={styles.itemPreview}>{firstLine(diary.body)}</Text>
              </Pressable>
            ))
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  muted: { fontSize: fontSize.body, color: colors.textMuted },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: { padding: spacing.md },
  monthButtonDisabled: { opacity: 0.3 },
  monthArrow: { fontSize: fontSize.heading, color: colors.primary },
  monthLabel: { fontSize: fontSize.heading, fontWeight: '700', color: colors.text },
  badge: {
    alignSelf: 'flex-start',
    fontSize: fontSize.caption,
    color: colors.textMuted,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
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

- [ ] **Step 2: 일기 쓰기·수정** — `apps/app/src/app/(main)/entry/write.tsx`

```tsx
import { DIARY_BODY_MAX, diaryInputSchema } from '@haruleaf/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { ApiError } from '@/api/client';
import { createDiaryRequest, fetchDiary, updateDiaryRequest } from '@/api/diary';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/FormMessage';
import { Screen } from '@/components/Screen';
import { useRemoteData } from '@/hooks/useRemoteData';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

export default function DiaryWriteScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  return date ? <EditDiary date={date} /> : <DiaryEditor initialBody="" mode={{ kind: 'create' }} />;
}

function EditDiary({ date }: { date: string }) {
  const load = useCallback(() => fetchDiary(date), [date]);
  const { state } = useRemoteData(load);
  if (state.status === 'loading') {
    return (
      <Screen>
        <Text style={styles.muted}>불러오는 중…</Text>
      </Screen>
    );
  }
  if (state.status === 'error') {
    return (
      <Screen>
        <FormMessage tone="error" message={state.message} />
        <Button title="돌아가기" variant="secondary" onPress={() => router.replace('/diary')} />
      </Screen>
    );
  }
  return <DiaryEditor key={date} initialBody={state.data.diary.body} mode={{ kind: 'edit', date }} />;
}

type Mode = { kind: 'create' } | { kind: 'edit'; date: string };

function DiaryEditor({ initialBody, mode }: { initialBody: string; mode: Mode }) {
  const [body, setBody] = useState(initialBody);
  const [message, setMessage] = useState<string | null>(null);
  const [needsPlant, setNeedsPlant] = useState(false);
  const [saving, setSaving] = useState(false);
  const length = Array.from(body).length;

  async function save() {
    if (saving) return;
    const parsed = diaryInputSchema.safeParse({ body });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const { diary } =
        mode.kind === 'create' ? await createDiaryRequest(parsed.data) : await updateDiaryRequest(mode.date, parsed.data);
      router.replace(`/entry/${diary.date}`);
    } catch (error) {
      setNeedsPlant(error instanceof ApiError && error.code === 'PLANT_NOT_SELECTED');
      setMessage(error instanceof ApiError ? error.message : '저장하지 못했어요.');
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        {mode.kind === 'create' ? '오늘 일기 쓰기' : '일기 고치기'}
      </Text>
      {message && <FormMessage tone="error" message={message} />}
      {needsPlant && <Button title="식물 고르러 가기" variant="secondary" onPress={() => router.push('/plants')} />}
      <TextInput
        style={styles.input}
        value={body}
        onChangeText={(value) => {
          setBody(value);
          setMessage(null);
        }}
        multiline
        textAlignVertical="top"
        placeholder="오늘 하루는 어땠나요?"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="일기 본문"
        autoFocus={mode.kind === 'create'}
      />
      <Text style={[styles.count, length > DIARY_BODY_MAX && styles.countOver]}>
        {length.toLocaleString('ko-KR')}/{DIARY_BODY_MAX.toLocaleString('ko-KR')}
      </Text>
      <Button title="저장" onPress={() => void save()} loading={saving} />
      <Button title="취소" variant="secondary" onPress={() => router.back()} disabled={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  muted: { fontSize: fontSize.body, color: colors.textMuted },
  input: {
    minHeight: 240,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    fontSize: fontSize.body,
    lineHeight: 24,
    color: colors.text,
  },
  count: { fontSize: fontSize.caption, color: colors.textMuted, textAlign: 'right' },
  countOver: { color: colors.danger },
});
```

- [ ] **Step 3: 일기 상세** — `apps/app/src/app/(main)/entry/[date].tsx`

```tsx
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '@/api/client';
import { deleteDiaryRequest, fetchDiary } from '@/api/diary';
import { Button } from '@/components/Button';
import { ConfirmModal } from '@/components/ConfirmModal';
import { FormMessage } from '@/components/FormMessage';
import { Screen } from '@/components/Screen';
import { useRemoteData } from '@/hooks/useRemoteData';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

function dateLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

export default function DiaryDetailScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const load = useCallback(() => fetchDiary(date), [date]);
  const { state, reload } = useRemoteData(load);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteDiaryRequest(date);
      setConfirmOpen(false);
      router.replace('/diary');
    } catch (error) {
      setDeleteError(error instanceof ApiError ? error.message : '삭제하지 못했어요.');
      setDeleting(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        {dateLabel(date)}
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
          {!state.data.editable && <Text style={styles.badge}>지난달 기록은 읽기 전용이에요.</Text>}
          <View style={styles.bodyCard}>
            <Text style={styles.body}>{state.data.diary.body}</Text>
          </View>
          {state.data.editable && (
            <>
              <Button title="고치기" onPress={() => router.push(`/entry/write?date=${date}`)} />
              <Button title="삭제" variant="danger" onPress={() => setConfirmOpen(true)} />
            </>
          )}
        </>
      )}
      <Button title="목록으로" variant="secondary" onPress={() => router.replace('/diary')} />
      <ConfirmModal
        visible={confirmOpen}
        title="이 일기를 지울까요?"
        description="지우면 이번 달 작성일수와 성장률이 줄어요. 식물은 그대로 유지돼요."
        confirmLabel="삭제"
        confirmVariant="danger"
        onConfirm={() => void remove()}
        onCancel={() => {
          if (!deleting) {
            setConfirmOpen(false);
            setDeleteError(null);
          }
        }}
        loading={deleting}>
        {deleteError && <FormMessage tone="error" message={deleteError} />}
      </ConfirmModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  muted: { fontSize: fontSize.body, color: colors.textMuted },
  badge: {
    alignSelf: 'flex-start',
    fontSize: fontSize.caption,
    color: colors.textMuted,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  bodyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  body: { fontSize: fontSize.body, lineHeight: 26, color: colors.text },
});
```

- [ ] **Step 4: 검증**

Run: `cd ~/HaruLeaf && npm run db:up && npm test && npm run typecheck && npm run lint`
Expected: 모두 통과.

Web 흐름(`npm run dev` 백그라운드, 브라우저 도구가 있으면 사용):
1. 새 계정 가입 → 일기 탭 → "이번 달에 쓴 일기가 없어요." 와 [오늘 일기 쓰기] → 쓰기 화면에서 저장 → "이번 달 식물을 먼저 골라주세요." + [식물 고르러 가기].
2. 식물 선택(몬스테라) → 홈 [오늘 일기 쓰기] → 여러 줄 입력, 글자 수 표시 → 저장 → 상세 화면(줄바꿈 유지) → 홈으로 가면 "3.2% · 1/31일"(10월), [식물 바꾸기] 사라짐, [오늘 일기 보기].
3. 상세 → [고치기] → 수정 저장 → 상세에 반영, 홈 작성일수 그대로.
4. 일기 탭 → 목록에 오늘 일기, [오늘 일기 쓰기] 없음 → ◀ 지난달 → "읽기 전용" 배지, ▶로 돌아오기, 이번 달에서 ▶ 비활성.
5. 상세 → [삭제] → 확인 → 목록으로 → 홈 "0.0% · 0/31일", 식물은 그대로 고정(식물 바꾸기 없음).
6. 브라우저 콘솔 오류 0. 확인 후 dev 종료, 포트 비움.

- [ ] **Step 5: 커밋**

```bash
cd ~/HaruLeaf
git add apps/app/src/app
git commit -m "feat: 일기 목록(월 이동·읽기 전용)·쓰기·수정·상세·삭제 화면 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## 설계 문서와의 차이 (의도된 결정)

- `DiaryListResponse`에 `today`를 추가했다(일기 탭에서 오늘 일기 여부를 별도 요청 없이 판단).
- 숨김 화면 경로는 탭 `diary`와 겹치지 않도록 `/entry/write`, `/entry/[date]`, `/plants`로 했다(설계의 `diary/write` 대신).
- 임시 그림은 512×512로 만든다(최종 이미지는 1024×1024 권장, 화면 표시 크기는 같다).
- 교차 기기(iOS ↔ Web) 수동 확인은 구현 완료 후 컨트롤러가 수행한다.
