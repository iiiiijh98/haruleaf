# HaruLeaf 기반(Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `~/HaruLeaf` 모노레포에 PostgreSQL 스키마(9개 테이블)·Fastify API 뼈대(`GET /health`)·Expo 앱 뼈대(iOS·Web)를 만들어, 모든 기기에서 "서버 연결 정상"이 표시되게 한다.

**Architecture:** npm workspaces 모노레포. `packages/shared`(순수 TS: 성장률 계산·Zod 스키마·API 타입)를 `apps/server`(Fastify + Drizzle + pg)와 `apps/app`(Expo SDK 57 + Expo Router)이 소스 그대로 import한다. PostgreSQL 16은 Docker Compose(호스트 포트 5433, named volume)로 띄우고, `scripts/dev.mjs`가 맥북 LAN IP를 감지해 서버와 Expo를 함께 실행한다.

**Tech Stack:** Node 26, npm 11 workspaces, TypeScript ~6.0.3, Fastify ^5.12.5, @fastify/cors ^11.3.0, drizzle-orm ^0.45.3, drizzle-kit ^0.31.11, pg ^8.23.0, zod ^4.6.5, vitest ^5.0.2, tsx ^4.23.15, Expo SDK 57 (expo ~57.0.26, expo-router ~57.0.24, react-native 0.86.3), PostgreSQL 16 (Docker).

**설계 문서:** `docs/superpowers/specs/2026-09-30-haruleaf-foundation-design.md`

## Global Constraints

- 지원 플랫폼: iOS · Web만. Android 설정·스크립트를 만들지 않는다.
- 날짜 판정: 서버가 `Asia/Seoul` 기준 `YYYY-MM-DD`로 계산한다(`TZ_NAME`, 기본 `Asia/Seoul`).
- DB 접속: `postgres://haruleaf:haruleaf@localhost:5433/haruleaf` (개발), `postgres://haruleaf:haruleaf@localhost:5433/haruleaf_test` (테스트). 호스트의 Homebrew PostgreSQL이 5432를 쓰므로 Docker는 **5433**.
- 서버 포트 4000, 바인딩 `0.0.0.0`. Expo 개발 서버 8081.
- 오류 응답 형식: `{ "error": { "code": string, "message": string } }`, `message`는 사용자에게 보여줄 한국어.
- 모든 요청에 `X-Client-Platform: ios | web` 헤더 필수(OPTIONS 제외). 없거나 잘못되면 400 `INVALID_PLATFORM`.
- 로그에 비밀번호·토큰·일기 본문을 남기지 않는다.
- Expo 패키지 추가는 `apps/app`에서 `npx expo install <pkg>`로 한다(`apps/app/AGENTS.md`). Expo API는 v57 문서 기준.
- TypeScript는 모든 워크스페이스에서 `~6.0.3`(Expo 템플릿과 동일)으로 맞춘다.
- 커밋 메시지는 한국어로 쓰고, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`를 붙인다.
- 이 단계에서 인증 API·`requireAuth` 플러그인·기능 화면은 만들지 않는다(3단계).

## 파일 구조

```
~/HaruLeaf/
├─ package.json                 워크스페이스 루트, 공통 스크립트
├─ tsconfig.base.json           server/shared 공통 TS 설정
├─ .gitignore  .env.example  README.md
├─ docker-compose.yml           PostgreSQL 16 (5433, volume haruleaf-pgdata)
├─ docker/initdb/01-create-test-db.sql
├─ scripts/
│  ├─ lan-address.mjs           pickLanAddress(interfaces) — 순수 함수
│  ├─ lan-address.test.mjs      node:test
│  └─ dev.mjs                   LAN IP 감지 → 서버 + Expo 동시 실행
├─ packages/shared/
│  ├─ package.json  tsconfig.json  vitest.config.ts
│  └─ src/
│     ├─ index.ts               재수출
│     ├─ calendar.ts            daysInMonth
│     ├─ growth.ts              growthPercent, growthStage, isFullyGrown, FULL_GROWTH_PERCENT
│     ├─ platform.ts            platformSchema, Platform
│     ├─ api.ts                 ApiErrorBody, HealthResponse
│     └─ *.test.ts
├─ apps/server/
│  ├─ package.json  tsconfig.json  vitest.config.ts  drizzle.config.ts
│  ├─ src/
│  │  ├─ config.ts              loadConfig, DEFAULT_DATABASE_URL
│  │  ├─ lib/clock.ts           Clock, systemClock, fixedClock
│  │  ├─ lib/errors.ts          AppError, registerErrorHandlers
│  │  ├─ db/schema.ts           Drizzle 테이블 9개
│  │  ├─ db/client.ts           createDb → { db, pool }, Db 타입
│  │  ├─ db/migrate.ts          runMigrations(url) + CLI
│  │  ├─ db/seed-data.ts        CATALOG
│  │  ├─ db/seed.ts             seedCatalog(db) + CLI
│  │  ├─ db/migrations/         drizzle-kit 생성물(커밋)
│  │  ├─ routes/health.ts       healthRoutes 플러그인
│  │  ├─ app.ts                 buildApp(deps)
│  │  └─ server.ts              실행 진입점
│  └─ test/
│     ├─ global-setup.ts        테스트 DB 마이그레이션
│     ├─ helpers.ts             TEST_DATABASE_URL, createTestDb, resetDatabase, pgErrorCode
│     ├─ config.test.ts  clock.test.ts  schema.test.ts  app.test.ts
└─ apps/app/                    (기존 ~/HaruLeaf/my-app 이동)
   ├─ package.json  app.json  tsconfig.json  eslint.config.js  AGENTS.md
   └─ src/
      ├─ app/_layout.tsx                 AuthProvider + Stack.Protected
      ├─ app/(auth)/_layout.tsx  login.tsx  signup.tsx
      ├─ app/(main)/_layout.tsx  index.tsx  diary.tsx  garden.tsx  shop.tsx  profile.tsx
      ├─ api/client.ts                   apiRequest, ApiError, API_URL, setAuthToken, setUnauthorizedHandler
      ├─ api/health.ts                   getHealth
      ├─ auth/tokenStore.ts              iOS: expo-secure-store
      ├─ auth/tokenStore.web.ts          Web: localStorage
      ├─ auth/AuthProvider.tsx           AuthProvider, useAuth
      ├─ theme/tokens.ts                 colors, spacing, radius, fontSize, MAX_CONTENT_WIDTH
      └─ components/Screen.tsx  Placeholder.tsx  ServerStatus.tsx
```

---

### Task 1: 모노레포 루트 구성과 앱 이동, DB 컨테이너

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.env.example`, `docker-compose.yml`, `docker/initdb/01-create-test-db.sql`
- Modify: `.gitignore` (루트, 이미 존재 — 전체 교체)
- Move: `my-app/` → `apps/app/`
- Modify: `apps/app/package.json`
- Delete: `apps/app/package-lock.json`, `apps/app/node_modules/`

**Interfaces:**
- Consumes: 없음
- Produces: 루트 스크립트 이름 `db:up`, `db:down`, `db:generate`, `db:migrate`, `db:seed`, `dev`, `dev:server`, `dev:app`, `test`, `typecheck`, `lint` (본문은 이후 작업에서 워크스페이스가 채움). 워크스페이스 패키지 이름 `@haruleaf/app`, `@haruleaf/server`, `@haruleaf/shared`. DB 두 개: `haruleaf`, `haruleaf_test` (사용자/비번 `haruleaf`/`haruleaf`, 호스트 포트 5433).

- [ ] **Step 1: 현재 상태 확인**

Run: `cd ~/HaruLeaf && git status --short | head -5 && ls`
Expected: 템플릿 파일들이 ` D README.md`처럼 삭제로 보이고(저장소 루트를 `my-app`에서 `~/HaruLeaf`로 올렸기 때문), `ls`에 `docs  my-app`이 보인다. `git log --oneline`에 `Initial commit`, `docs: 기반(Foundation) 단계 설계 문서 추가`가 있다.

- [ ] **Step 2: 앱 폴더 이동과 설치 산출물 정리**

```bash
cd ~/HaruLeaf
mkdir -p apps
mv my-app apps/app
rm -rf apps/app/node_modules apps/app/package-lock.json apps/app/.expo
```

- [ ] **Step 3: 루트 `.gitignore` 작성 (기존 내용 전체 교체)**

```gitignore
# dependencies
node_modules/

# env
.env
.env*.local

# editors / OS
.DS_Store
.idea/

# build / cache
dist/
*.tsbuildinfo
```

- [ ] **Step 4: 루트 `package.json` 작성**

```json
{
  "name": "haruleaf",
  "private": true,
  "version": "0.1.0",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "db:up": "docker compose up -d --wait",
    "db:down": "docker compose down",
    "db:generate": "npm run db:generate -w @haruleaf/server",
    "db:migrate": "npm run db:migrate -w @haruleaf/server",
    "db:seed": "npm run db:seed -w @haruleaf/server",
    "dev": "node scripts/dev.mjs",
    "dev:server": "npm run dev -w @haruleaf/server",
    "dev:app": "npm run start -w @haruleaf/app",
    "test": "npm run test --workspaces --if-present && node --test scripts/",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "lint": "npm run lint -w @haruleaf/app"
  }
}
```

- [ ] **Step 5: `tsconfig.base.json` 작성 (server·shared 공용)**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "preserve",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": []
  }
}
```

- [ ] **Step 6: `apps/app/package.json` 수정**

`name`을 `@haruleaf/app`으로, `scripts`를 아래로 교체한다(`android`, `reset-project` 제거, `typecheck` 추가). `dependencies`/`devDependencies`는 그대로 둔다.

```json
  "name": "@haruleaf/app",
```

```json
  "scripts": {
    "start": "expo start",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "lint": "expo lint",
    "typecheck": "tsc --noEmit"
  },
```

그리고 템플릿 초기화 스크립트를 지운다: `rm -rf apps/app/scripts`

- [ ] **Step 7: Docker Compose와 테스트 DB 초기화 SQL 작성**

`docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: haruleaf-db
    environment:
      POSTGRES_USER: haruleaf
      POSTGRES_PASSWORD: haruleaf
      POSTGRES_DB: haruleaf
      TZ: Asia/Seoul
    ports:
      - "5433:5432"
    volumes:
      - haruleaf-pgdata:/var/lib/postgresql/data
      - ./docker/initdb:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U haruleaf -d haruleaf"]
      interval: 2s
      timeout: 3s
      retries: 30

volumes:
  haruleaf-pgdata:
```

`docker/initdb/01-create-test-db.sql`:

```sql
CREATE DATABASE haruleaf_test OWNER haruleaf;
```

- [ ] **Step 8: `.env.example` 작성**

```dotenv
# 서버 (apps/server). 값이 없으면 아래 기본값을 사용한다. 필요할 때만 루트에 .env로 복사해서 수정.
DATABASE_URL=postgres://haruleaf:haruleaf@localhost:5433/haruleaf
HOST=0.0.0.0
PORT=4000
CORS_ORIGINS=http://localhost:8081
ATTENDANCE_COINS=5
TZ_NAME=Asia/Seoul

# 테스트 DB (apps/server 테스트)
TEST_DATABASE_URL=postgres://haruleaf:haruleaf@localhost:5433/haruleaf_test

# 앱 (apps/app). `npm run dev`가 맥북 LAN IP로 자동 설정한다.
EXPO_PUBLIC_API_URL=http://localhost:4000
```

- [ ] **Step 9: 의존성 설치**

Run: `cd ~/HaruLeaf && npm install`
Expected: 오류 없이 끝나고 루트에 `node_modules/`와 `package-lock.json`이 생긴다. `ls node_modules/@haruleaf` → `app`.

- [ ] **Step 10: 앱이 워크스페이스에서 정상 인식되는지 확인**

Run: `cd ~/HaruLeaf/apps/app && npx expo config --type public | head -5`
Expected: `name: 'my-app'` 등 설정이 출력된다(이름 변경은 Task 6). 오류가 없어야 한다.

- [ ] **Step 11: DB 컨테이너 실행과 확인**

Docker Desktop이 꺼져 있으면 먼저 실행한다: `open -a Docker` 후 `docker info`가 성공할 때까지 기다린다.

Run: `cd ~/HaruLeaf && npm run db:up && docker exec haruleaf-db psql -U haruleaf -d haruleaf -Atc "select datname from pg_database where datname like 'haruleaf%' order by 1"`
Expected:
```
haruleaf
haruleaf_test
```

- [ ] **Step 12: 커밋**

```bash
cd ~/HaruLeaf
git add -A
git status --short | grep -v '^R' | head -20   # 이동(R) 외 변경이 package.json, .gitignore, 신규 파일뿐인지 확인
git commit -m "chore: 모노레포 루트 구성 및 앱을 apps/app으로 이동

npm workspaces, 공용 tsconfig, PostgreSQL 16 Docker Compose(5433) 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `packages/shared` — 달력·성장률·플랫폼 스키마·API 타입

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/calendar.ts`, `growth.ts`, `platform.ts`, `api.ts`, `index.ts`
- Test: `packages/shared/src/calendar.test.ts`, `growth.test.ts`, `platform.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces (`import { … } from '@haruleaf/shared'`):
  - `daysInMonth(year: number, month: number): number` — month는 1~12, 잘못되면 `RangeError`
  - `FULL_GROWTH_PERCENT: 80`
  - `growthPercent(writtenDays: number, totalDays: number): number` — 반올림 없음, 100 상한
  - `growthStage(percent: number): 1 | 2 | 3 | 4 | 5`
  - `isFullyGrown(percent: number): boolean`
  - `platformSchema: z.ZodEnum<['ios','web']>`, `type Platform = 'ios' | 'web'`, `PLATFORM_HEADER = 'x-client-platform'`
  - `type ApiErrorBody = { error: { code: string; message: string } }`
  - `type HealthResponse = { status: 'ok'; db: 'ok'; today: string }`

- [ ] **Step 1: 패키지 설정 파일 작성**

`packages/shared/package.json`:

```json
{
  "name": "@haruleaf/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

`packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "vitest.config.ts"]
}
```

`packages/shared/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

Run: `cd ~/HaruLeaf && npm install zod@^4.6.5 -w @haruleaf/shared && npm install -D vitest@^5.0.2 typescript@~6.0.3 -w @haruleaf/shared`
Expected: 설치 성공, `packages/shared/package.json`에 dependencies/devDependencies가 추가된다.

- [ ] **Step 2: 실패하는 테스트 작성**

`packages/shared/src/calendar.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { daysInMonth } from './calendar';

describe('daysInMonth', () => {
  it.each([
    [2026, 2, 28],
    [2028, 2, 29],
    [2100, 2, 28],
    [2000, 2, 29],
    [2026, 9, 30],
    [2026, 10, 31],
    [2026, 12, 31],
    [2027, 1, 31],
  ])('%i년 %i월은 %i일', (year, month, expected) => {
    expect(daysInMonth(year, month)).toBe(expected);
  });

  it.each([0, 13, 1.5])('잘못된 월 %s는 RangeError', (month) => {
    expect(() => daysInMonth(2026, month)).toThrow(RangeError);
  });
});
```

`packages/shared/src/growth.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FULL_GROWTH_PERCENT, growthPercent, growthStage, isFullyGrown } from './growth';

describe('growthPercent', () => {
  it('해당 월 전체 일수를 분모로 쓴다', () => {
    expect(growthPercent(9, 30)).toBe(30);
    expect(growthPercent(10, 31)).toBeCloseTo(32.258, 3);
  });

  it('반올림하지 않은 값을 돌려준다', () => {
    expect(growthPercent(24, 31)).toBeCloseTo(77.419, 3);
    expect(growthPercent(25, 31)).toBeCloseTo(80.645, 3);
  });

  it('100을 넘지 않는다', () => {
    expect(growthPercent(31, 30)).toBe(100);
  });

  it('0일이면 0', () => {
    expect(growthPercent(0, 28)).toBe(0);
  });

  it.each([
    [-1, 30],
    [1.5, 30],
    [5, 27],
    [5, 32],
  ])('잘못된 입력 (%s, %s)는 RangeError', (written, total) => {
    expect(() => growthPercent(written, total)).toThrow(RangeError);
  });
});

describe('growthStage', () => {
  it.each([
    [0, 1],
    [19.99, 1],
    [20, 2],
    [39.99, 2],
    [40, 3],
    [59.99, 3],
    [60, 4],
    [79.99, 4],
    [80, 5],
    [100, 5],
  ])('%s%% → %i단계', (percent, stage) => {
    expect(growthStage(percent)).toBe(stage);
  });
});

describe('isFullyGrown', () => {
  it('80% 이상만 완전 성장', () => {
    expect(FULL_GROWTH_PERCENT).toBe(80);
    expect(isFullyGrown(79.99)).toBe(false);
    expect(isFullyGrown(80)).toBe(true);
    expect(isFullyGrown(growthPercent(24, 31))).toBe(false);
    expect(isFullyGrown(growthPercent(25, 31))).toBe(true);
    expect(isFullyGrown(growthPercent(24, 30))).toBe(true);
  });
});
```

`packages/shared/src/platform.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PLATFORM_HEADER, platformSchema } from './platform';

describe('platformSchema', () => {
  it('ios와 web만 허용한다', () => {
    expect(platformSchema.parse('ios')).toBe('ios');
    expect(platformSchema.parse('web')).toBe('web');
    expect(platformSchema.safeParse('android').success).toBe(false);
    expect(platformSchema.safeParse(undefined).success).toBe(false);
  });

  it('헤더 이름은 소문자', () => {
    expect(PLATFORM_HEADER).toBe('x-client-platform');
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/shared`
Expected: FAIL — `Failed to resolve import "./calendar"` 등 모듈을 찾지 못하는 오류.

- [ ] **Step 4: 구현 작성**

`packages/shared/src/calendar.ts`:

```ts
/** 해당 연·월(1~12)의 실제 일수(28/29/30/31). */
export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`잘못된 연월입니다: ${year}-${month}`);
  }
  // 다음 달 0일 = 이번 달 마지막 날
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
```

`packages/shared/src/growth.ts`:

```ts
export const FULL_GROWTH_PERCENT = 80;

export type GrowthStage = 1 | 2 | 3 | 4 | 5;

/** 성장률 = 작성일수 ÷ 해당 월 전체 일수 × 100 (반올림 없음, 100 상한). */
export function growthPercent(writtenDays: number, totalDays: number): number {
  if (!Number.isInteger(writtenDays) || writtenDays < 0) {
    throw new RangeError(`작성일수가 올바르지 않습니다: ${writtenDays}`);
  }
  if (!Number.isInteger(totalDays) || totalDays < 28 || totalDays > 31) {
    throw new RangeError(`월 일수가 올바르지 않습니다: ${totalDays}`);
  }
  return Math.min(100, (writtenDays / totalDays) * 100);
}

/** 반올림 전 성장률로 단계를 판정한다: 0~19 / 20~39 / 40~59 / 60~79 / 80~100. */
export function growthStage(percent: number): GrowthStage {
  if (percent >= FULL_GROWTH_PERCENT) return 5;
  if (percent >= 60) return 4;
  if (percent >= 40) return 3;
  if (percent >= 20) return 2;
  return 1;
}

export function isFullyGrown(percent: number): boolean {
  return percent >= FULL_GROWTH_PERCENT;
}
```

`packages/shared/src/platform.ts`:

```ts
import { z } from 'zod';

export const PLATFORM_HEADER = 'x-client-platform';

export const platformSchema = z.enum(['ios', 'web']);

export type Platform = z.infer<typeof platformSchema>;
```

`packages/shared/src/api.ts`:

```ts
export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

export type HealthResponse = {
  status: 'ok';
  db: 'ok';
  /** 서버 기준(Asia/Seoul) 오늘 날짜, YYYY-MM-DD */
  today: string;
};
```

`packages/shared/src/index.ts`:

```ts
export * from './api';
export * from './calendar';
export * from './growth';
export * from './platform';
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/shared`
Expected: PASS — 3개 파일, 모든 테스트 통과.

- [ ] **Step 6: 타입체크**

Run: `cd ~/HaruLeaf && npm run typecheck -w @haruleaf/shared`
Expected: 출력 없이 종료 코드 0.

- [ ] **Step 7: 커밋**

```bash
cd ~/HaruLeaf
git add packages/shared package.json package-lock.json
git commit -m "feat: 공용 패키지에 월 일수·성장률·플랫폼 스키마 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 서버 설정 로더와 한국 시간 시계

**Files:**
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`, `apps/server/vitest.config.ts`
- Create: `apps/server/src/config.ts`, `apps/server/src/lib/clock.ts`
- Create: `apps/server/test/global-setup.ts` (이 작업에서는 빈 설정, Task 4에서 채움)
- Test: `apps/server/test/config.test.ts`, `apps/server/test/clock.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `DEFAULT_DATABASE_URL = 'postgres://haruleaf:haruleaf@localhost:5433/haruleaf'`
  - `type Config = { databaseUrl: string; host: string; port: number; corsOrigins: string[]; attendanceCoins: number; timeZone: string }`
  - `loadConfig(env?: Record<string, string | undefined>): Config` — 잘못된 값이면 `Error('환경변수 설정이 올바르지 않습니다: …')`
  - `interface Clock { today(): string }` (`YYYY-MM-DD`)
  - `systemClock(timeZone: string, now?: () => Date): Clock`
  - `fixedClock(date: string): Clock`

- [ ] **Step 1: 서버 패키지 설정**

`apps/server/package.json`:

```json
{
  "name": "@haruleaf/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:seed": "tsx src/db/seed.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@haruleaf/shared": "*"
  }
}
```

`apps/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src", "test", "vitest.config.ts", "drizzle.config.ts"]
}
```

`apps/server/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // 테스트 DB 하나를 공유하므로 파일을 순차 실행한다.
    fileParallelism: false,
  },
});
```

`apps/server/test/global-setup.ts` (Task 4에서 교체):

```ts
export default async function setup(): Promise<void> {}
```

Run:
```bash
cd ~/HaruLeaf
npm install fastify@^5.12.5 @fastify/cors@^11.3.0 drizzle-orm@^0.45.3 pg@^8.23.0 zod@^4.6.5 -w @haruleaf/server
npm install -D drizzle-kit@^0.31.11 tsx@^4.23.15 vitest@^5.0.2 @types/pg@^8.23.1 @types/node@^26.6.3 typescript@~6.0.3 -w @haruleaf/server
```
Expected: 설치 성공.

- [ ] **Step 2: 실패하는 테스트 작성**

`apps/server/test/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_DATABASE_URL, loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('값이 없으면 기본값을 쓴다', () => {
    expect(loadConfig({})).toEqual({
      databaseUrl: DEFAULT_DATABASE_URL,
      host: '0.0.0.0',
      port: 4000,
      corsOrigins: ['http://localhost:8081'],
      attendanceCoins: 5,
      timeZone: 'Asia/Seoul',
    });
  });

  it('CORS_ORIGINS는 쉼표로 나누고 공백·빈 값을 제거한다', () => {
    const config = loadConfig({ CORS_ORIGINS: 'http://localhost:8081, http://192.168.0.5:8081,' });
    expect(config.corsOrigins).toEqual(['http://localhost:8081', 'http://192.168.0.5:8081']);
  });

  it('숫자 환경변수를 변환한다', () => {
    const config = loadConfig({ PORT: '4100', ATTENDANCE_COINS: '7' });
    expect(config.port).toBe(4100);
    expect(config.attendanceCoins).toBe(7);
  });

  it.each([
    [{ PORT: 'abc' }],
    [{ ATTENDANCE_COINS: '0' }],
    [{ TZ_NAME: 'Not/AZone' }],
  ])('잘못된 값 %j는 오류', (env) => {
    expect(() => loadConfig(env)).toThrow('환경변수 설정이 올바르지 않습니다');
  });
});
```

`apps/server/test/clock.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fixedClock, systemClock } from '../src/lib/clock';

describe('systemClock', () => {
  it('Asia/Seoul 기준 날짜를 돌려준다 (UTC 15:30 = 다음 날 00:30)', () => {
    const clock = systemClock('Asia/Seoul', () => new Date('2026-09-30T15:30:00Z'));
    expect(clock.today()).toBe('2026-10-01');
  });

  it('자정 직전은 같은 날', () => {
    const clock = systemClock('Asia/Seoul', () => new Date('2026-09-30T14:59:59Z'));
    expect(clock.today()).toBe('2026-09-30');
  });

  it('연말 경계', () => {
    const clock = systemClock('Asia/Seoul', () => new Date('2026-12-31T15:00:00Z'));
    expect(clock.today()).toBe('2027-01-01');
  });
});

describe('fixedClock', () => {
  it('주어진 날짜를 그대로 돌려준다', () => {
    expect(fixedClock('2028-02-29').today()).toBe('2028-02-29');
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server`
Expected: FAIL — `../src/config`, `../src/lib/clock`을 찾지 못함.

- [ ] **Step 4: 구현 작성**

`apps/server/src/config.ts`:

```ts
import { z } from 'zod';

export const DEFAULT_DATABASE_URL = 'postgres://haruleaf:haruleaf@localhost:5433/haruleaf';

const isValidTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).default(DEFAULT_DATABASE_URL),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:8081'),
  ATTENDANCE_COINS: z.coerce.number().int().positive().default(5),
  TZ_NAME: z.string().refine(isValidTimeZone, '알 수 없는 시간대').default('Asia/Seoul'),
});

export type Config = {
  databaseUrl: string;
  host: string;
  port: number;
  corsOrigins: string[];
  attendanceCoins: number;
  timeZone: string;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
    throw new Error(`환경변수 설정이 올바르지 않습니다: ${detail}`);
  }
  const value = parsed.data;
  return {
    databaseUrl: value.DATABASE_URL,
    host: value.HOST,
    port: value.PORT,
    corsOrigins: value.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    attendanceCoins: value.ATTENDANCE_COINS,
    timeZone: value.TZ_NAME,
  };
}
```

`apps/server/src/lib/clock.ts`:

```ts
export interface Clock {
  /** 서버 기준 시간대의 오늘 날짜, YYYY-MM-DD */
  today(): string;
}

export function systemClock(timeZone: string, now: () => Date = () => new Date()): Clock {
  // en-CA 로캘은 YYYY-MM-DD 형식으로 출력한다.
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return { today: () => formatter.format(now()) };
}

export function fixedClock(date: string): Clock {
  return { today: () => date };
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server`
Expected: PASS — config 6개, clock 4개 통과.

- [ ] **Step 6: 커밋**

```bash
cd ~/HaruLeaf
git add apps/server package.json package-lock.json
git commit -m "feat: 서버 환경변수 로더와 한국 시간 기준 시계 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: DB 스키마·마이그레이션·카탈로그 시드

**Files:**
- Create: `apps/server/drizzle.config.ts`
- Create: `apps/server/src/db/schema.ts`, `client.ts`, `migrate.ts`, `seed-data.ts`, `seed.ts`
- Create (생성물): `apps/server/src/db/migrations/*`
- Modify: `apps/server/test/global-setup.ts`
- Create: `apps/server/test/helpers.ts`
- Test: `apps/server/test/schema.test.ts`

**Interfaces:**
- Consumes: `loadConfig`, `DEFAULT_DATABASE_URL` (Task 3)
- Produces:
  - 테이블 객체(`schema.ts`): `users`, `userCredentials`, `sessions`, `authEvents`, `plants`, `userPlants`, `diaries`, `monthlyRecords`, `coinTransactions`
  - `createDb(url: string): { db: Db; pool: pg.Pool }`, `type Db = NodePgDatabase<typeof schema>`
  - `runMigrations(url: string): Promise<void>`
  - `CATALOG: PlantSeed[]` (9건), `seedCatalog(db: Db): Promise<void>` (멱등)
  - 테스트 헬퍼: `TEST_DATABASE_URL`, `createTestDb(): { db: Db; pool: pg.Pool }`, `resetDatabase(db: Db): Promise<void>`, `pgErrorCode(error: unknown): string | undefined`

- [ ] **Step 1: Drizzle 설정 작성**

`apps/server/drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://haruleaf:haruleaf@localhost:5433/haruleaf',
  },
});
```

- [ ] **Step 2: 스키마 작성**

`apps/server/src/db/schema.ts`:

```ts
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    loginId: varchar('login_id', { length: 30 }).notNull().unique(),
    nickname: varchar('nickname', { length: 30 }).notNull(),
    coinBalance: integer('coin_balance').notNull().default(0),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check('users_coin_balance_nonnegative', sql`${t.coinBalance} >= 0`),
    check('users_login_id_format', sql`${t.loginId} ~ '^[a-z0-9_]{3,30}$'`),
    check('users_nickname_not_blank', sql`char_length(btrim(${t.nickname})) >= 1`),
  ],
);

export const userCredentials = pgTable('user_credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: char('token_hash', { length: 64 }).notNull().unique(),
    platform: varchar('platform', { length: 8 }).notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    lastUsedAt: timestamptz('last_used_at').notNull().defaultNow(),
    expiresAt: timestamptz('expires_at').notNull(),
    revokedAt: timestamptz('revoked_at'),
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
    check('sessions_platform_valid', sql`${t.platform} in ('ios', 'web')`),
  ],
);

export const authEvents = pgTable(
  'auth_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    loginId: varchar('login_id', { length: 30 }).notNull(),
    event: varchar('event', { length: 16 }).notNull(),
    platform: varchar('platform', { length: 8 }).notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('auth_events_user_id_idx').on(t.userId),
    check('auth_events_event_valid', sql`${t.event} in ('SIGNUP', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT')`),
    check('auth_events_platform_valid', sql`${t.platform} in ('ios', 'web')`),
  ],
);

export const plants = pgTable(
  'plants',
  {
    id: varchar('id', { length: 40 }).primaryKey(),
    name: varchar('name', { length: 40 }).notNull(),
    description: text('description').notNull(),
    kind: varchar('kind', { length: 8 }).notNull(),
    catalogClass: varchar('catalog_class', { length: 10 }).notNull(),
    initialFree: boolean('initial_free').notNull(),
    coinPrice: integer('coin_price'),
    sortOrder: integer('sort_order').notNull(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [
    check('plants_kind_valid', sql`${t.kind} in ('PLANT', 'FLOWER')`),
    check('plants_class_valid', sql`${t.catalogClass} in ('STANDARD', 'LIMITED', 'SPECIAL')`),
    check(
      'plants_price_matches_class',
      sql`(${t.catalogClass} = 'STANDARD' and ${t.coinPrice} is null) or (${t.catalogClass} <> 'STANDARD' and ${t.coinPrice} > 0)`,
    ),
    check('plants_initial_is_standard', sql`not ${t.initialFree} or ${t.catalogClass} = 'STANDARD'`),
  ],
);

export const userPlants = pgTable(
  'user_plants',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    plantId: varchar('plant_id', { length: 40 })
      .notNull()
      .references(() => plants.id),
    unlockSource: varchar('unlock_source', { length: 12 }).notNull(),
    unlockedAt: timestamptz('unlocked_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.plantId] }),
    check('user_plants_source_valid', sql`${t.unlockSource} in ('INITIAL', 'ACHIEVEMENT', 'SHOP')`),
  ],
);

export const diaries = pgTable(
  'diaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    diaryDate: date('diary_date', { mode: 'string' }).notNull(),
    body: text('body').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('diaries_user_date_unique').on(t.userId, t.diaryDate),
    check('diaries_body_length', sql`char_length(btrim(${t.body})) between 1 and 10000`),
  ],
);

export const monthlyRecords = pgTable(
  'monthly_records',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    month: date('month', { mode: 'string' }).notNull(),
    plantId: varchar('plant_id', { length: 40 }).references(() => plants.id),
    selectionLocked: boolean('selection_locked').notNull().default(false),
    totalDays: smallint('total_days').notNull(),
    writtenDays: smallint('written_days').notNull().default(0),
    growthPercent: numeric('growth_percent', { precision: 5, scale: 2 }).notNull().default('0'),
    growthStage: smallint('growth_stage').notNull().default(1),
    finalized: boolean('finalized').notNull().default(false),
    finalizedAt: timestamptz('finalized_at'),
    unlockedPlantId: varchar('unlocked_plant_id', { length: 40 }).references(() => plants.id),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.month] }),
    check('monthly_records_month_first_day', sql`extract(day from ${t.month}) = 1`),
    check('monthly_records_total_days_range', sql`${t.totalDays} between 28 and 31`),
    check('monthly_records_written_days_range', sql`${t.writtenDays} between 0 and ${t.totalDays}`),
    check('monthly_records_growth_percent_range', sql`${t.growthPercent} between 0 and 100`),
    check('monthly_records_growth_stage_range', sql`${t.growthStage} between 1 and 5`),
  ],
);

export const coinTransactions = pgTable(
  'coin_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 12 }).notNull(),
    amount: integer('amount').notNull(),
    referenceKey: varchar('reference_key', { length: 40 }).notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('coin_transactions_once_per_reference').on(t.userId, t.type, t.referenceKey),
    check(
      'coin_transactions_amount_sign',
      sql`(${t.type} = 'ATTENDANCE' and ${t.amount} > 0) or (${t.type} = 'PURCHASE' and ${t.amount} < 0)`,
    ),
  ],
);
```

- [ ] **Step 3: DB 클라이언트·마이그레이션·시드 코드 작성**

`apps/server/src/db/client.ts`:

```ts
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

export function createDb(url: string): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
```

`apps/server/src/db/migrate.ts`:

```ts
import { fileURLToPath, pathToFileURL } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadConfig } from '../config';
import { createDb } from './client';

const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));

export async function runMigrations(url: string): Promise<void> {
  const { db, pool } = createDb(url);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runMigrations(loadConfig().databaseUrl);
  console.log('마이그레이션을 적용했습니다.');
}
```

`apps/server/src/db/seed-data.ts`:

```ts
export type PlantSeed = {
  id: string;
  name: string;
  description: string;
  kind: 'PLANT' | 'FLOWER';
  catalogClass: 'STANDARD' | 'LIMITED' | 'SPECIAL';
  initialFree: boolean;
  coinPrice: number | null;
  sortOrder: number;
};

// 임시 카탈로그. 이름·가격은 추후 교체 가능.
export const CATALOG: PlantSeed[] = [
  { id: 'monstera', name: '몬스테라', description: '잎 사이로 스며드는 작은 여유', kind: 'PLANT', catalogClass: 'STANDARD', initialFree: true, coinPrice: null, sortOrder: 1 },
  { id: 'rose', name: '장미', description: '차곡차곡 피어나는 나의 마음', kind: 'FLOWER', catalogClass: 'STANDARD', initialFree: true, coinPrice: null, sortOrder: 2 },
  { id: 'sunflower', name: '해바라기', description: '오늘의 빛을 기억하는 꽃', kind: 'FLOWER', catalogClass: 'STANDARD', initialFree: true, coinPrice: null, sortOrder: 3 },
  { id: 'tulip', name: '튤립', description: '조용히 시작하는 새로운 하루', kind: 'FLOWER', catalogClass: 'STANDARD', initialFree: true, coinPrice: null, sortOrder: 4 },
  { id: 'lavender', name: '라벤더', description: '하루의 끝에 남기는 보랏빛 쉼', kind: 'FLOWER', catalogClass: 'STANDARD', initialFree: true, coinPrice: null, sortOrder: 5 },
  { id: 'hydrangea', name: '수국', description: '꾸준한 기록으로 만나는 꽃', kind: 'FLOWER', catalogClass: 'STANDARD', initialFree: false, coinPrice: null, sortOrder: 6 },
  { id: 'daisy', name: '데이지', description: '소박한 날들이 모인 선물', kind: 'FLOWER', catalogClass: 'STANDARD', initialFree: false, coinPrice: null, sortOrder: 7 },
  { id: 'moonflower', name: '달빛 꽃', description: '밤하늘을 닮은 특별한 꽃', kind: 'FLOWER', catalogClass: 'LIMITED', initialFree: false, coinPrice: 50, sortOrder: 8 },
  { id: 'anthurium', name: '산호빛 안스리움', description: '정원에 더하는 따뜻한 색', kind: 'FLOWER', catalogClass: 'SPECIAL', initialFree: false, coinPrice: 100, sortOrder: 9 },
];
```

`apps/server/src/db/seed.ts`:

```ts
import { sql } from 'drizzle-orm';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../config';
import { createDb, type Db } from './client';
import { plants } from './schema';
import { CATALOG } from './seed-data';

/** 카탈로그를 upsert한다. 여러 번 실행해도 결과가 같다. */
export async function seedCatalog(db: Db): Promise<void> {
  await db
    .insert(plants)
    .values(CATALOG)
    .onConflictDoUpdate({
      target: plants.id,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        kind: sql`excluded.kind`,
        catalogClass: sql`excluded.catalog_class`,
        initialFree: sql`excluded.initial_free`,
        coinPrice: sql`excluded.coin_price`,
        sortOrder: sql`excluded.sort_order`,
      },
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { db, pool } = createDb(loadConfig().databaseUrl);
  try {
    await seedCatalog(db);
    console.log(`식물 카탈로그 ${CATALOG.length}건을 반영했습니다.`);
  } finally {
    await pool.end();
  }
}
```

- [ ] **Step 4: 마이그레이션 생성**

Run: `cd ~/HaruLeaf && npm run db:generate -- --name init`
Expected: `apps/server/src/db/migrations/0000_init.sql`과 `meta/` 폴더가 생긴다. 확인:
Run: `grep -c 'CREATE TABLE' apps/server/src/db/migrations/0000_init.sql`
Expected: `9`
Run: `grep -o 'CONSTRAINT "[a-z_]*"' apps/server/src/db/migrations/0000_init.sql | sort | head -40`
Expected: `users_coin_balance_nonnegative`, `plants_price_matches_class`, `coin_transactions_amount_sign`, `monthly_records_month_first_day` 등 CHECK 제약 이름이 보인다.

- [ ] **Step 5: 테스트 헬퍼와 global setup 작성**

`apps/server/test/helpers.ts`:

```ts
import { sql } from 'drizzle-orm';
import { createDb, type Db } from '../src/db/client';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://haruleaf:haruleaf@localhost:5433/haruleaf_test';

export function createTestDb() {
  return createDb(TEST_DATABASE_URL);
}

/** 모든 테이블을 비운다(시드 포함). */
export async function resetDatabase(db: Db): Promise<void> {
  await db.execute(sql`
    truncate table coin_transactions, monthly_records, diaries, user_plants,
      auth_events, sessions, user_credentials, users, plants
    restart identity cascade
  `);
}

/** pg 오류 코드(예: 23505 unique, 23514 check, 23503 FK). drizzle은 원본 오류를 cause에 담는다. */
export function pgErrorCode(error: unknown): string | undefined {
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  if (typeof candidate?.code === 'string' && /^\d{5}$/.test(candidate.code)) return candidate.code;
  if (typeof candidate?.cause?.code === 'string') return candidate.cause.code;
  return undefined;
}

export async function expectPgError(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    if (pgErrorCode(error) === code) return;
    throw new Error(`pg 오류 ${code}를 기대했지만 다른 오류가 났습니다: ${String(error)}`);
  }
  throw new Error(`pg 오류 ${code}를 기대했지만 성공했습니다.`);
}
```

`apps/server/test/global-setup.ts` (전체 교체):

```ts
import { runMigrations } from '../src/db/migrate';
import { TEST_DATABASE_URL } from './helpers';

export default async function setup(): Promise<void> {
  await runMigrations(TEST_DATABASE_URL);
}
```

- [ ] **Step 6: 스키마 테스트 작성**

`apps/server/test/schema.test.ts`:

```ts
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
```

- [ ] **Step 7: 테스트 실행 (DB 컨테이너가 떠 있어야 함)**

Run: `cd ~/HaruLeaf && npm run db:up && npm test -w @haruleaf/server`
Expected: PASS — config·clock·schema 모두 통과. 실패하면 오류 메시지의 제약 이름과 Step 2 스키마를 비교해 고친다(스키마를 고쳤다면 `apps/server/src/db/migrations`를 지우고 Step 4부터 다시 생성).

- [ ] **Step 8: 개발 DB에 적용하고 시드 확인**

Run: `cd ~/HaruLeaf && npm run db:migrate && npm run db:seed && npm run db:seed && docker exec haruleaf-db psql -U haruleaf -d haruleaf -Atc "select count(*) from plants"`
Expected: `마이그레이션을 적용했습니다.`, `식물 카탈로그 9건을 반영했습니다.`(두 번), 마지막 출력 `9`.

- [ ] **Step 9: 타입체크와 커밋**

Run: `cd ~/HaruLeaf && npm run typecheck -w @haruleaf/server`
Expected: 종료 코드 0.

```bash
cd ~/HaruLeaf
git add apps/server
git commit -m "feat: DB 스키마 9개 테이블·마이그레이션·식물 카탈로그 시드 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Fastify 앱 — 오류 형식·플랫폼 헤더·CORS·`GET /health`

**Files:**
- Create: `apps/server/src/lib/errors.ts`, `apps/server/src/routes/health.ts`, `apps/server/src/app.ts`, `apps/server/src/server.ts`
- Test: `apps/server/test/app.test.ts`

**Interfaces:**
- Consumes: `Clock`, `fixedClock`, `systemClock` (Task 3), `loadConfig` (Task 3), `createDb`, `Db` (Task 4), `platformSchema`, `PLATFORM_HEADER`, `Platform`, `HealthResponse`, `ApiErrorBody` (Task 2)
- Produces:
  - `class AppError extends Error { code: string; status: number }` — `new AppError(code, message, status)`
  - `registerErrorHandlers(app: FastifyInstance): void`
  - `type AppDeps = { db: Db; clock: Clock; corsOrigins: string[]; logger?: boolean }`
  - `buildApp(deps: AppDeps): Promise<FastifyInstance>` — 반환된 앱은 아직 `ready()` 전이라 테스트에서 라우트를 추가할 수 있다
  - `request.platform: Platform` (Fastify 타입 확장)

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/server/test/app.test.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { createDb } from '../src/db/client';
import { AppError } from '../src/lib/errors';
import { fixedClock } from '../src/lib/clock';
import { createTestDb } from './helpers';

const IOS = { 'x-client-platform': 'ios' };
const { db, pool } = createTestDb();
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ db, clock: fixedClock('2026-09-30'), corsOrigins: ['http://localhost:8081'] });
  app.get('/__test/boom', async () => {
    throw new Error('secret internal detail');
  });
  app.get('/__test/app-error', async () => {
    throw new AppError('SOMETHING_WRONG', '사용자에게 보여줄 문장', 409);
  });
  app.post('/__test/echo', async (request) => request.body);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('GET /health', () => {
  it('DB가 살아 있으면 ok와 서버 기준 오늘 날짜', async () => {
    const response = await app.inject({ method: 'GET', url: '/health', headers: IOS });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', db: 'ok', today: '2026-09-30' });
  });

  it('web 플랫폼도 허용', async () => {
    const response = await app.inject({ method: 'GET', url: '/health', headers: { 'x-client-platform': 'web' } });
    expect(response.statusCode).toBe(200);
  });

  it('DB에 연결할 수 없으면 503 DB_UNAVAILABLE', async () => {
    const broken = createDb('postgres://haruleaf:haruleaf@127.0.0.1:1/nothing');
    const brokenApp = await buildApp({ db: broken.db, clock: fixedClock('2026-09-30'), corsOrigins: [] });
    try {
      const response = await brokenApp.inject({ method: 'GET', url: '/health', headers: IOS });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        error: { code: 'DB_UNAVAILABLE', message: '데이터베이스에 연결할 수 없어요.' },
      });
    } finally {
      await brokenApp.close();
      await broken.pool.end();
    }
  });
});

describe('X-Client-Platform 헤더', () => {
  it('없으면 400 INVALID_PLATFORM', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: 'INVALID_PLATFORM', message: '지원하지 않는 클라이언트입니다.' },
    });
  });

  it('android는 400', async () => {
    const response = await app.inject({ method: 'GET', url: '/health', headers: { 'x-client-platform': 'android' } });
    expect(response.statusCode).toBe(400);
  });
});

describe('오류 응답 형식', () => {
  it('AppError는 코드·메시지·상태를 그대로', async () => {
    const response = await app.inject({ method: 'GET', url: '/__test/app-error', headers: IOS });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { code: 'SOMETHING_WRONG', message: '사용자에게 보여줄 문장' } });
  });

  it('예상치 못한 오류는 500 INTERNAL이고 내부 메시지를 숨긴다', async () => {
    const response = await app.inject({ method: 'GET', url: '/__test/boom', headers: IOS });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: { code: 'INTERNAL', message: '잠시 후 다시 시도해주세요.' } });
    expect(response.body).not.toContain('secret');
  });

  it('없는 경로는 404 NOT_FOUND', async () => {
    const response = await app.inject({ method: 'GET', url: '/nope', headers: IOS });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { code: 'NOT_FOUND', message: '요청한 기능을 찾을 수 없어요.' } });
  });

  it('잘못된 JSON 본문은 400 BAD_REQUEST', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/__test/echo',
      headers: { ...IOS, 'content-type': 'application/json' },
      payload: '{ broken',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BAD_REQUEST');
  });
});

describe('CORS', () => {
  it('허용된 출처의 preflight에 응답한다', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: {
        origin: 'http://localhost:8081',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'x-client-platform,authorization',
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:8081');
    expect(String(response.headers['access-control-allow-headers']).toLowerCase()).toContain('x-client-platform');
  });

  it('허용되지 않은 출처에는 allow-origin을 주지 않는다', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { ...IOS, origin: 'http://evil.example' },
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server -- test/app.test.ts`
Expected: FAIL — `../src/app`, `../src/lib/errors`를 찾지 못함.

- [ ] **Step 3: 오류 처리 작성**

`apps/server/src/lib/errors.ts`:

```ts
import type { ApiErrorBody } from '@haruleaf/shared';
import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

function send(reply: FastifyReply, status: number, code: string, message: string) {
  const body: ApiErrorBody = { error: { code, message } };
  return reply.status(status).send(body);
}

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    if (error instanceof AppError) {
      return send(reply, error.status, error.code, error.message);
    }
    if (error instanceof ZodError) {
      return send(reply, 400, 'VALIDATION_ERROR', error.issues[0]?.message ?? '입력값을 확인해주세요.');
    }
    const status = 'statusCode' in error ? error.statusCode : undefined;
    if (status && status >= 400 && status < 500) {
      return send(reply, status, 'BAD_REQUEST', '요청 형식이 올바르지 않아요.');
    }
    request.log.error({ err: error }, 'unhandled error');
    return send(reply, 500, 'INTERNAL', '잠시 후 다시 시도해주세요.');
  });

  app.setNotFoundHandler((_request, reply) => send(reply, 404, 'NOT_FOUND', '요청한 기능을 찾을 수 없어요.'));
}
```

- [ ] **Step 4: health 라우트와 앱 조립 작성**

`apps/server/src/routes/health.ts`:

```ts
import type { HealthResponse } from '@haruleaf/shared';
import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '../db/client';
import type { Clock } from '../lib/clock';
import { AppError } from '../lib/errors';

export const healthRoutes: FastifyPluginAsync<{ db: Db; clock: Clock }> = async (app, { db, clock }) => {
  app.get('/health', async (): Promise<HealthResponse> => {
    try {
      await db.execute(sql`select 1`);
    } catch {
      throw new AppError('DB_UNAVAILABLE', '데이터베이스에 연결할 수 없어요.', 503);
    }
    return { status: 'ok', db: 'ok', today: clock.today() };
  });
};
```

`apps/server/src/app.ts`:

```ts
import cors from '@fastify/cors';
import { PLATFORM_HEADER, platformSchema, type Platform } from '@haruleaf/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Db } from './db/client';
import type { Clock } from './lib/clock';
import { AppError, registerErrorHandlers } from './lib/errors';
import { healthRoutes } from './routes/health';

declare module 'fastify' {
  interface FastifyRequest {
    platform: Platform;
  }
}

export type AppDeps = {
  db: Db;
  clock: Clock;
  corsOrigins: string[];
  logger?: boolean;
};

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.logger
      ? { redact: ['req.headers.authorization', 'req.body.password', 'req.body.body'] }
      : false,
  });

  await app.register(cors, {
    origin: deps.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Client-Platform'],
  });

  registerErrorHandlers(app);

  app.decorateRequest('platform', 'web');
  app.addHook('onRequest', async (request) => {
    if (request.method === 'OPTIONS') return;
    const parsed = platformSchema.safeParse(request.headers[PLATFORM_HEADER]);
    if (!parsed.success) {
      throw new AppError('INVALID_PLATFORM', '지원하지 않는 클라이언트입니다.', 400);
    }
    request.platform = parsed.data;
  });

  await app.register(healthRoutes, { db: deps.db, clock: deps.clock });

  return app;
}
```

`apps/server/src/server.ts`:

```ts
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { loadConfig } from './config';
import { createDb } from './db/client';
import { systemClock } from './lib/clock';

// 루트 .env가 있으면 읽는다(이미 설정된 환경변수는 덮어쓰지 않음).
const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const config = loadConfig();
const { db, pool } = createDb(config.databaseUrl);
const app = await buildApp({
  db,
  clock: systemClock(config.timeZone),
  corsOrigins: config.corsOrigins,
  logger: true,
});

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

await app.listen({ host: config.host, port: config.port });
app.log.info({ corsOrigins: config.corsOrigins }, 'HaruLeaf API 서버가 시작되었습니다.');
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server`
Expected: PASS — config, clock, schema, app 모두 통과.

- [ ] **Step 6: 실제 서버 기동 확인**

Run (백그라운드로 띄운 뒤 확인하고 종료):
```bash
cd ~/HaruLeaf
npm run dev:server > /tmp/haruleaf-server.log 2>&1 &
SERVER_PID=$!
sleep 4
curl -s -H 'X-Client-Platform: web' http://localhost:4000/health; echo
curl -s http://localhost:4000/health; echo
kill $SERVER_PID
```
Expected: 첫 줄 `{"status":"ok","db":"ok","today":"<오늘 날짜>"}`, 두 번째 줄 `{"error":{"code":"INVALID_PLATFORM","message":"지원하지 않는 클라이언트입니다."}}`.

- [ ] **Step 7: 타입체크와 커밋**

Run: `cd ~/HaruLeaf && npm run typecheck -w @haruleaf/server`
Expected: 종료 코드 0.

```bash
cd ~/HaruLeaf
git add apps/server
git commit -m "feat: Fastify 서버 뼈대와 헬스체크·공통 오류 형식·플랫폼 헤더 검증 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 앱 뼈대 — 템플릿 정리·토큰·API 클라이언트·인증 상태·라우트

**Files:**
- Delete: `apps/app/src/components/*`(템플릿 전부), `apps/app/src/hooks/`, `apps/app/src/constants/`, `apps/app/src/global.css`, `apps/app/src/app/explore.tsx`, `apps/app/src/app/index.tsx`, `apps/app/assets/images/tabIcons/`, `apps/app/assets/images/{expo-badge.png,expo-badge-white.png,expo-logo.png,logo-glow.png,react-logo.png,react-logo@2x.png,react-logo@3x.png,tutorial-web.png,android-icon-background.png,android-icon-foreground.png,android-icon-monochrome.png}`
- Modify: `apps/app/app.json`, `apps/app/package.json`, `apps/app/src/app/_layout.tsx`
- Create: `apps/app/eslint.config.js`
- Create: `apps/app/src/theme/tokens.ts`, `src/api/client.ts`, `src/api/health.ts`, `src/auth/tokenStore.ts`, `src/auth/tokenStore.web.ts`, `src/auth/AuthProvider.tsx`, `src/components/Screen.tsx`, `src/components/Placeholder.tsx`, `src/components/ServerStatus.tsx`
- Create: `apps/app/src/app/(auth)/_layout.tsx`, `(auth)/login.tsx`, `(auth)/signup.tsx`, `(main)/_layout.tsx`, `(main)/index.tsx`, `(main)/diary.tsx`, `(main)/garden.tsx`, `(main)/shop.tsx`, `(main)/profile.tsx`

**Interfaces:**
- Consumes: `HealthResponse`, `ApiErrorBody`, `PLATFORM_HEADER` (Task 2), 서버 `GET /health` (Task 5)
- Produces (3단계 이후 화면이 사용):
  - `API_URL: string`
  - `class ApiError extends Error { code: string; status: number }`
  - `apiRequest<T>(path: string, options?: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown }): Promise<T>` — 현재 토큰을 자동 첨부
  - `setAuthToken(token: string | null): void`, `setUnauthorizedHandler(handler: (() => void) | null): void`
  - `getHealth(): Promise<HealthResponse>`
  - `loadToken(): Promise<string | null>`, `saveToken(token: string): Promise<void>`, `clearToken(): Promise<void>`
  - `AuthProvider`, `useAuth(): { status: 'loading' | 'signedOut' | 'signedIn'; signIn(token: string): Promise<void>; signOut(): Promise<void> }`
  - `colors`, `spacing`, `radius`, `fontSize`, `MAX_CONTENT_WIDTH` (`theme/tokens.ts`)
  - `<Screen>`, `<Placeholder title description>`, `<ServerStatus />`

- [ ] **Step 1: 템플릿 파일 삭제**

```bash
cd ~/HaruLeaf/apps/app
rm -rf src/components src/hooks src/constants src/global.css src/app/explore.tsx src/app/index.tsx assets/images/tabIcons
rm -f assets/images/expo-badge.png assets/images/expo-badge-white.png assets/images/expo-logo.png assets/images/logo-glow.png \
  assets/images/react-logo.png assets/images/react-logo@2x.png assets/images/react-logo@3x.png assets/images/tutorial-web.png \
  assets/images/android-icon-background.png assets/images/android-icon-foreground.png assets/images/android-icon-monochrome.png
ls assets/images
```
Expected: `favicon.png  icon.png  splash-icon.png`

- [ ] **Step 2: `app.json` 교체**

`typedRoutes`는 끈다(생성된 라우트 타입이 오래되면 타입체크가 실패하므로 기반 단계에서는 사용하지 않음).

```json
{
  "expo": {
    "name": "하루한잎",
    "slug": "haruleaf",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "haruleaf",
    "userInterfaceStyle": "light",
    "ios": {
      "icon": "./assets/expo.icon",
      "supportsTablet": false
    },
    "web": {
      "output": "single",
      "favicon": "./assets/images/favicon.png"
    },
    "plugins": [
      "expo-router",
      [
        "expo-splash-screen",
        {
          "backgroundColor": "#F6F8F4",
          "image": "./assets/images/splash-icon.png",
          "imageWidth": 76
        }
      ]
    ],
    "experiments": {
      "typedRoutes": false,
      "reactCompiler": true
    }
  }
}
```

`web.output`을 `single`(SPA)로 바꾼 이유: 로그인 여부에 따라 화면이 바뀌는 앱이라 정적 사전 렌더링이 필요 없다.

- [ ] **Step 3: 의존성 추가와 ESLint 설정**

```bash
cd ~/HaruLeaf/apps/app
npx expo install expo-secure-store
npx expo install eslint eslint-config-expo -- --save-dev
cd ~/HaruLeaf
npm pkg set 'dependencies.@haruleaf/shared=*' -w @haruleaf/app
npm install
```
Expected: `apps/app/package.json`에 `expo-secure-store`, `@haruleaf/shared`, devDependencies에 `eslint`, `eslint-config-expo`가 들어간다.

`apps/app/eslint.config.js`:

```js
// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*'],
  },
]);
```

- [ ] **Step 4: 디자인 토큰(임시값) 작성**

`apps/app/src/theme/tokens.ts`:

```ts
// 임시 디자인 토큰. Figma 디자인 시스템이 확정되면 이 파일의 값만 교체한다.
export const colors = {
  background: '#F6F8F4',
  surface: '#FFFFFF',
  text: '#263B31',
  textMuted: '#65776B',
  primary: '#356547',
  primarySoft: '#E7EEE2',
  border: '#DCE4D8',
  danger: '#A64141',
  dangerSoft: '#FCECEC',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 18 } as const;

export const fontSize = { caption: 12, body: 16, heading: 20, title: 26 } as const;

/** 넓은 Web 화면에서 콘텐츠가 퍼지지 않도록 하는 최대 폭 */
export const MAX_CONTENT_WIDTH = 960;
```

- [ ] **Step 5: API 클라이언트 작성**

`apps/app/src/api/client.ts`:

```ts
import { PLATFORM_HEADER, type ApiErrorBody } from '@haruleaf/shared';
import { Platform } from 'react-native';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    [PLATFORM_HEADER]: Platform.OS === 'web' ? 'web' : 'ios',
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', '서버에 연결할 수 없어요. 네트워크와 서버 상태를 확인해주세요.', 0);
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (data as ApiErrorBody | null)?.error;
    if (response.status === 401 && authToken) unauthorizedHandler?.();
    throw new ApiError(error?.code ?? 'UNKNOWN', error?.message ?? '요청을 처리하지 못했어요.', response.status);
  }
  return data as T;
}
```

`apps/app/src/api/health.ts`:

```ts
import type { HealthResponse } from '@haruleaf/shared';
import { apiRequest } from './client';

export function getHealth(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>('/health');
}
```

- [ ] **Step 6: 토큰 저장소 작성 (iOS / Web)**

`apps/app/src/auth/tokenStore.ts` (iOS — Metro가 `.web.ts`가 없는 플랫폼에서 사용):

```ts
import * as SecureStore from 'expo-secure-store';

const KEY = 'haruleaf.session';

export async function loadToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
```

`apps/app/src/auth/tokenStore.web.ts` (expo-secure-store는 Web 미지원):

```ts
const KEY = 'haruleaf.session';

export async function loadToken(): Promise<string | null> {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function saveToken(token: string): Promise<void> {
  try {
    window.localStorage.setItem(KEY, token);
  } catch {
    // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 이번 세션만 유지된다.
  }
}

export async function clearToken(): Promise<void> {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}
```

- [ ] **Step 7: 인증 상태 Provider 작성**

`apps/app/src/auth/AuthProvider.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setAuthToken, setUnauthorizedHandler } from '@/api/client';
import { clearToken, loadToken, saveToken } from './tokenStore';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

type AuthContextValue = {
  status: AuthStatus;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let active = true;
    loadToken().then((token) => {
      if (!active) return;
      setAuthToken(token);
      setStatus(token ? 'signedIn' : 'signedOut');
    });
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (token: string) => {
    await saveToken(token);
    setAuthToken(token);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    await clearToken();
    setAuthToken(null);
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  const value = useMemo(() => ({ status, signIn, signOut }), [status, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있습니다.');
  return value;
}
```

- [ ] **Step 8: 공통 컴포넌트 작성**

`apps/app/src/components/Screen.tsx`:

```tsx
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, MAX_CONTENT_WIDTH, spacing } from '@/theme/tokens';

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.content}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, alignItems: 'center' },
  content: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, padding: spacing.xl, gap: spacing.lg },
});
```

`apps/app/src/components/ServerStatus.tsx`:

```tsx
import type { HealthResponse } from '@haruleaf/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { API_URL, ApiError } from '@/api/client';
import { getHealth } from '@/api/health';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; health: HealthResponse }
  | { kind: 'error'; message: string };

/** 서버·DB 연결 상태 표시(개발 확인용). */
export function ServerStatus() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    getHealth()
      .then((health) => active && setState({ kind: 'ok', health }))
      .catch((error: unknown) =>
        active && setState({ kind: 'error', message: error instanceof ApiError ? error.message : '알 수 없는 오류' }),
      );
    return () => {
      active = false;
    };
  }, []);

  const ok = state.kind === 'ok';
  return (
    <View style={[styles.box, ok ? styles.ok : state.kind === 'error' ? styles.error : null]} accessibilityRole="summary">
      <Text style={styles.title}>
        {state.kind === 'loading' ? '서버 확인 중…' : ok ? '서버 연결 정상' : '서버 연결 실패'}
      </Text>
      {state.kind === 'ok' && <Text style={styles.detail}>서버 기준 오늘: {state.health.today}</Text>}
      {state.kind === 'error' && <Text style={styles.detail}>{state.message}</Text>}
      <Text style={styles.detail}>API: {API_URL}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  ok: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  error: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  title: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  detail: { fontSize: fontSize.caption, color: colors.textMuted },
});
```

`apps/app/src/components/Placeholder.tsx`:

```tsx
import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors, fontSize } from '@/theme/tokens';
import { Screen } from './Screen';

/** 기능 구현 전 자리표시 화면 */
export function Placeholder({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.description}>{description}</Text>
      {children}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  description: { fontSize: fontSize.body, color: colors.textMuted, lineHeight: 24 },
});
```

- [ ] **Step 9: 라우트 작성**

`apps/app/src/app/_layout.tsx` (전체 교체):

```tsx
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { status } = useAuth();

  useEffect(() => {
    if (status !== 'loading') void SplashScreen.hideAsync();
  }, [status]);

  if (status === 'loading') return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === 'signedIn'}>
        <Stack.Screen name="(main)" />
      </Stack.Protected>
      <Stack.Protected guard={status !== 'signedIn'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
```

`apps/app/src/app/(auth)/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

`apps/app/src/app/(auth)/login.tsx`:

```tsx
import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';
import { Placeholder } from '@/components/Placeholder';
import { ServerStatus } from '@/components/ServerStatus';
import { colors, fontSize } from '@/theme/tokens';

export default function LoginScreen() {
  return (
    <Placeholder title="하루한잎" description="로그인 화면은 3단계에서 구현합니다.">
      <ServerStatus />
      <Link href="/signup" style={styles.link}>
        회원가입으로 이동
      </Link>
    </Placeholder>
  );
}

const styles = StyleSheet.create({
  link: { fontSize: fontSize.body, color: colors.primary, fontWeight: '600' },
});
```

`apps/app/src/app/(auth)/signup.tsx`:

```tsx
import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';
import { Placeholder } from '@/components/Placeholder';
import { colors, fontSize } from '@/theme/tokens';

export default function SignupScreen() {
  return (
    <Placeholder title="회원가입" description="아이디·비밀번호·닉네임 입력 화면은 3단계에서 구현합니다.">
      <Link href="/login" style={styles.link}>
        로그인으로 돌아가기
      </Link>
    </Placeholder>
  );
}

const styles = StyleSheet.create({
  link: { fontSize: fontSize.body, color: colors.primary, fontWeight: '600' },
});
```

`apps/app/src/app/(main)/_layout.tsx`:

```tsx
import { Tabs } from 'expo-router';
import { colors } from '@/theme/tokens';

export default function MainLayout() {
  return (
    <Tabs
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
    </Tabs>
  );
}
```

`apps/app/src/app/(main)/index.tsx`:

```tsx
import { Placeholder } from '@/components/Placeholder';
import { ServerStatus } from '@/components/ServerStatus';

export default function HomeScreen() {
  return (
    <Placeholder title="홈" description="홈 화면은 4단계에서 구현합니다.">
      <ServerStatus />
    </Placeholder>
  );
}
```

`apps/app/src/app/(main)/diary.tsx`:

```tsx
import { Placeholder } from '@/components/Placeholder';

export default function DiaryScreen() {
  return <Placeholder title="일기" description="일기 화면은 4단계에서 구현합니다." />;
}
```

`apps/app/src/app/(main)/garden.tsx`:

```tsx
import { Placeholder } from '@/components/Placeholder';

export default function GardenScreen() {
  return <Placeholder title="나의 정원" description="정원 화면은 6단계에서 구현합니다." />;
}
```

`apps/app/src/app/(main)/shop.tsx`:

```tsx
import { Placeholder } from '@/components/Placeholder';

export default function ShopScreen() {
  return <Placeholder title="상점" description="상점 화면은 5단계에서 구현합니다." />;
}
```

`apps/app/src/app/(main)/profile.tsx`:

```tsx
import { Placeholder } from '@/components/Placeholder';

export default function ProfileScreen() {
  return <Placeholder title="프로필" description="프로필·로그아웃·회원탈퇴는 3단계에서 구현합니다." />;
}
```

- [ ] **Step 10: 타입체크와 lint**

Run: `cd ~/HaruLeaf && npm run typecheck -w @haruleaf/app && npm run lint`
Expected: 둘 다 오류 0. (lint 경고가 있으면 내용을 확인해 코드 쪽에서 고친다.)

- [ ] **Step 11: Web에서 화면 확인**

서버와 DB가 떠 있는 상태에서:
```bash
cd ~/HaruLeaf
npm run db:up
npm run dev:server > /tmp/haruleaf-server.log 2>&1 &
cd apps/app && npx expo start --web --port 8081
```
브라우저에서 `http://localhost:8081`을 연다.
Expected: 로그인 자리표시 화면(제목 "하루한잎")이 보이고, "서버 연결 정상", "서버 기준 오늘: <오늘 날짜>", "API: http://localhost:4000"이 표시된다. 브라우저 콘솔에 CORS 오류가 없다. "회원가입으로 이동"을 누르면 회원가입 자리표시 화면으로 이동한다. 확인 후 Expo(Ctrl+C)와 서버(`kill %1`)를 종료한다.

- [ ] **Step 12: 커밋**

```bash
cd ~/HaruLeaf
git add -A apps/app package.json package-lock.json
git commit -m "feat: 앱 뼈대 구성 — 템플릿 정리, 임시 디자인 토큰, API 클라이언트, 인증 상태, 라우트

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 개발 실행 스크립트(LAN IP 자동 감지)·README·전체 검증

**Files:**
- Create: `scripts/lan-address.mjs`, `scripts/dev.mjs`, `README.md`
- Test: `scripts/lan-address.test.mjs`

**Interfaces:**
- Consumes: 루트 스크립트 `dev:server`/`dev:app`에 해당하는 워크스페이스 스크립트 (Task 3·6), 서버 환경변수 `CORS_ORIGINS` (Task 3), 앱 환경변수 `EXPO_PUBLIC_API_URL` (Task 6)
- Produces: `pickLanAddress(interfaces: Record<string, Array<{ address: string; family: string | number; internal: boolean }> | undefined>): string`

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/lan-address.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickLanAddress } from './lan-address.mjs';

const v4 = (address, internal = false) => ({ address, family: 'IPv4', internal });

test('en0(Wi-Fi) IPv4를 우선한다', () => {
  assert.equal(
    pickLanAddress({ lo0: [v4('127.0.0.1', true)], bridge100: [v4('192.168.64.1')], en0: [v4('192.168.0.12')] }),
    '192.168.0.12',
  );
});

test('en0가 없으면 사설 IP 대역을 고른다', () => {
  assert.equal(pickLanAddress({ utun4: [v4('100.64.0.2')], en1: [v4('10.0.0.7')] }), '10.0.0.7');
});

test('내부(loopback)와 IPv6는 제외한다', () => {
  assert.equal(
    pickLanAddress({ lo0: [v4('127.0.0.1', true)], en0: [{ address: 'fe80::1', family: 'IPv6', internal: false }] }),
    'localhost',
  );
});

test('숫자 family(4)도 IPv4로 인식한다', () => {
  assert.equal(pickLanAddress({ en0: [{ address: '172.20.10.3', family: 4, internal: false }] }), '172.20.10.3');
});

test('후보가 없으면 localhost', () => {
  assert.equal(pickLanAddress({}), 'localhost');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd ~/HaruLeaf && node --test scripts/`
Expected: FAIL — `Cannot find module .../scripts/lan-address.mjs`.

- [ ] **Step 3: 구현 작성**

`scripts/lan-address.mjs`:

```js
const PRIVATE_RANGE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/**
 * os.networkInterfaces() 결과에서 같은 Wi-Fi의 다른 기기가 접속할 수 있는 IPv4 주소를 고른다.
 * 우선순위: en0(맥 Wi-Fi) → 사설 IP 대역 → 그 밖의 외부 IPv4 → 'localhost'
 */
export function pickLanAddress(interfaces) {
  const candidates = [];
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const entry of addresses ?? []) {
      const isV4 = entry.family === 'IPv4' || entry.family === 4;
      if (isV4 && !entry.internal) candidates.push({ name, address: entry.address });
    }
  }
  const chosen =
    candidates.find((candidate) => candidate.name === 'en0') ??
    candidates.find((candidate) => PRIVATE_RANGE.test(candidate.address)) ??
    candidates[0];
  return chosen?.address ?? 'localhost';
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd ~/HaruLeaf && node --test scripts/`
Expected: PASS — 5개 통과.

- [ ] **Step 5: 개발 실행 스크립트 작성**

`scripts/dev.mjs`:

```js
import { spawn } from 'node:child_process';
import os from 'node:os';
import { pickLanAddress } from './lan-address.mjs';

const API_PORT = 4000;
const EXPO_PORT = 8081;

const host = pickLanAddress(os.networkInterfaces());
const apiUrl = `http://${host}:${API_PORT}`;
const corsOrigins = [...new Set([`http://localhost:${EXPO_PORT}`, `http://${host}:${EXPO_PORT}`])].join(',');

console.log('');
console.log(`  맥북 주소      : ${host}${host === 'localhost' ? ' (네트워크 없음 → 시뮬레이터·이 맥의 브라우저만 접속 가능)' : ''}`);
console.log(`  API 서버       : ${apiUrl}`);
console.log(`  Web            : http://${host}:${EXPO_PORT}`);
console.log(`  CORS 허용 출처 : ${corsOrigins}`);
console.log('');

const children = [
  // 서버는 키 입력을 받지 않으므로 stdin을 넘기지 않는다(Expo 단축키 i/w와 충돌 방지).
  spawn('npm', ['run', 'dev', '-w', '@haruleaf/server'], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, CORS_ORIGINS: corsOrigins, PORT: String(API_PORT) },
  }),
  spawn('npm', ['run', 'start', '-w', '@haruleaf/app', '--', '--port', String(EXPO_PORT)], {
    stdio: 'inherit',
    env: { ...process.env, EXPO_PUBLIC_API_URL: apiUrl },
  }),
];

let stopping = false;
function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGINT');
  }
  setTimeout(() => process.exit(code), 500);
}

for (const child of children) {
  child.on('exit', (code) => stopAll(code ?? 0));
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
```

- [ ] **Step 6: README 작성**

`README.md`:

````markdown
# 하루한잎 (HaruLeaf)

일기를 쓴 날만큼 이달의 식물이 자라는 iOS · Web 앱.

- `apps/app` — Expo(SDK 57) + Expo Router 앱 (iOS · Web)
- `apps/server` — Fastify + Drizzle API 서버
- `packages/shared` — 앱·서버 공용 코드(성장률 계산, 스키마, 타입)

## 준비물

- Node.js 20 이상, npm
- Docker Desktop (PostgreSQL 실행용)
- Xcode + iOS 시뮬레이터 (iOS 확인 시)
- 실제 아이폰으로 볼 때: App Store의 **Expo Go**

## 처음 한 번

```bash
npm install
npm run db:up        # PostgreSQL 16 (localhost:5433) 실행, 데이터는 Docker 볼륨에 영구 보존
npm run db:migrate   # 테이블 생성
npm run db:seed      # 식물 카탈로그 입력
```

## 실행

```bash
npm run dev
```

- 맥북 Wi-Fi 주소를 자동으로 찾아 API 서버(4000)와 Expo(8081)를 함께 띄운다.
- 터미널에서 `i` → iOS 시뮬레이터, `w` → 브라우저.
- 실제 아이폰: 맥북과 **같은 Wi-Fi**에 연결하고 Expo Go로 터미널의 QR 코드를 찍는다.
- 다른 컴퓨터 브라우저: 터미널에 표시된 `Web` 주소로 접속한다.
- 모든 기기가 같은 서버·같은 DB를 쓰므로, 한 기기에서 가입한 계정으로 다른 기기에서 로그인해도 같은 기록이 보인다.
- 처음 실행할 때 macOS가 "들어오는 네트워크 연결 허용"을 물으면 허용한다.

### 아이폰이 서버에 연결되지 않을 때

- 학교·공용 Wi-Fi는 기기끼리 통신을 막는 경우가 많다. 맥북을 **아이폰 개인용 핫스팟**에 연결하고 `npm run dev`를 다시 실행한다.
- Wi-Fi를 바꿨다면 `npm run dev`를 다시 실행한다(주소가 바뀌므로).

## 확인 명령

```bash
npm test          # shared 단위 테스트 + server 통합 테스트(테스트 DB 사용) + 스크립트 테스트
npm run typecheck
npm run lint
```

## DB 관리

```bash
npm run db:down                                             # 컨테이너 중지(데이터 유지)
docker exec -it haruleaf-db psql -U haruleaf -d haruleaf    # DB 직접 조회
npm run db:generate -- --name <이름>                         # 스키마 변경 후 마이그레이션 생성
```

데이터를 완전히 지우려면 `docker compose down -v` (볼륨 삭제, 되돌릴 수 없음).
````

- [ ] **Step 7: 전체 자동 검증**

Run: `cd ~/HaruLeaf && npm run db:up && npm test && npm run typecheck && npm run lint`
Expected: 모두 통과(shared, server, scripts 테스트 PASS / 타입 오류 0 / lint 오류 0).

- [ ] **Step 8: 실제 실행 검증 (iOS 시뮬레이터 + Web)**

Run: `cd ~/HaruLeaf && npm run dev`
Expected:
1. 처음에 맥북 주소·API 주소·Web 주소가 출력된다.
2. 터미널에서 `w` → 브라우저에서 로그인 자리표시 화면과 "서버 연결 정상", "API: http://<맥북 IP>:4000"이 보인다.
3. 터미널에서 `i` → iOS 시뮬레이터의 Expo Go에서 같은 화면과 "서버 연결 정상"이 보인다.
4. 서버 로그에 `/health` 요청이 두 번(web, ios) 기록된다.

확인 후 Ctrl+C로 종료하면 서버와 Expo가 함께 종료된다.

- [ ] **Step 9: 커밋**

```bash
cd ~/HaruLeaf
git add scripts README.md
git commit -m "feat: LAN 주소 자동 감지 개발 실행 스크립트와 README 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## 설계 문서와의 차이 (의도된 결정)

- `plugins/auth.ts`(requireAuth)는 세션 발급이 생기는 3단계에서 만든다. 기반 단계에는 검증할 대상이 없다.
- 서버 연결 상태(`ServerStatus`)는 홈뿐 아니라 로그인 자리표시 화면에도 넣는다. 2단계에서는 로그인할 수 없어 홈에 들어갈 수 없기 때문이다.
- `typedRoutes`는 끈다(생성 타입이 오래되면 타입체크가 깨지는 문제 회피). 필요하면 이후 단계에서 다시 켠다.
- Docker PostgreSQL은 호스트 포트 **5433**을 쓴다(맥북의 Homebrew PostgreSQL이 5432 사용 중).
