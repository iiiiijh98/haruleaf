# HaruLeaf 3단계 — 회원가입·로그인·프로필·탈퇴 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아이디·비밀번호·닉네임 계정 기능(가입·로그인·로그아웃·닉네임 수정·탈퇴)을 서버 API와 iOS·Web 화면으로 완성하고, 같은 계정이 모든 기기에서 동일하게 보이게 한다.

**Architecture:** 입력 규칙은 `packages/shared`의 Zod 스키마 하나로 앱·서버가 공유한다(zod는 shared가 재수출하는 한 벌만 사용). 서버는 `domain/accounts.ts`에 트랜잭션 로직을, `plugins/auth.ts`에 Bearer 세션 확인을, `routes/`에 얇은 HTTP 계층을 둔다. 앱은 `AuthProvider`가 토큰·사용자·연결 상태를 관리하고, 공용 폼 컴포넌트로 로그인·회원가입·프로필 화면을 만든다.

**Tech Stack:** Node 26, npm workspaces, TypeScript ~6.0.3, zod 4.6.5(shared 경유), Fastify 5, Drizzle 0.45 + pg, Vitest 5, Expo SDK 57 + Expo Router, react-native 0.86.

**설계 문서:** `docs/superpowers/specs/2026-09-30-haruleaf-auth-design.md`

## Global Constraints

- 아이디: trim → 소문자 변환 → `^[a-z0-9_]{3,20}$`. 메시지 "아이디는 영문 소문자·숫자·_ 3~20자로 입력해주세요."
- 비밀번호(가입): 8~64자, 공백 불가, `[A-Z]`·`[0-9]`·`[^A-Za-z0-9\s]` 각 1자 이상. 메시지: 길이 "비밀번호는 8~64자로 입력해주세요." / 공백 "비밀번호에는 공백을 쓸 수 없어요." / 조합 "비밀번호에 대문자·숫자·특수문자를 각각 1자 이상 넣어주세요."
- 닉네임: trim 후 코드포인트 1~10자. 메시지 "닉네임은 1~10자로 입력해주세요."
- 로그인 입력은 형식 규칙 없이 아이디 1~100자, 비밀번호 1~64자만 확인. 실패 기록(auth_events.login_id)에는 앞 30자만 저장.
- 오류 코드·메시지: `LOGIN_ID_TAKEN` 409 "이미 사용 중인 아이디입니다." / `INVALID_CREDENTIALS` 401 "아이디 또는 비밀번호가 올바르지 않습니다." / `INVALID_PASSWORD` 401 "비밀번호가 올바르지 않습니다." / `UNAUTHORIZED` 401 "다시 로그인해주세요." / `VALIDATION_ERROR` 400(스키마의 한국어 메시지).
- 세션: 로그인·가입마다 새 세션, 만료 = 발급 + 30일 고정, 기기별 동시 로그인 허용. 유효 = `revoked_at IS NULL AND expires_at > now()`.
- 비밀번호 해시 형식 `scrypt$<salt 32 hex>$<hash 128 hex>` (N=16384, r=8, p=1, keylen 64).
- 모든 성공 응답은 JSON 본문을 가진다(204 미사용). `OkResponse = { ok: true }`.
- 서버 로그에 비밀번호·토큰·해시·일기 본문·DB 오류 message를 남기지 않는다.
- 서버와 앱은 zod를 직접 import하지 않고 `import { z } from '@haruleaf/shared'`로만 쓴다.
- 앱은 `ApiError.code === 'UNAUTHORIZED'`(세션 토큰 사용 요청)일 때만 자동 로그아웃한다.
- 커밋 메시지는 한국어, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Docker DB(`npm run db:up`, 호스트 5433)가 떠 있어야 서버 테스트가 돈다.

## 파일 구조

```
packages/shared/src/
  index.ts                 (수정) z·auth·validation 재수출
  auth.ts                  (신규) 입력 스키마·메시지·User/AuthResponse/MeResponse/OkResponse 타입
  validation.ts            (신규) firstIssueByField
  auth.test.ts, validation.test.ts
apps/server/
  package.json             (수정) zod 의존성 제거
  src/config.ts            (수정) z를 shared에서
  src/lib/errors.ts        (수정) z.ZodError instanceof, serializeError, 500 로그 정리
  src/lib/password.ts      (신규) hashPassword, verifyPassword, dummyPasswordHash
  src/lib/token.ts         (신규) createToken, hashToken
  src/lib/request-meta.ts  (신규) clientMeta
  src/domain/accounts.ts   (신규) signup, login, authenticate, logout, getUser, updateNickname, deleteAccount
  src/plugins/auth.ts      (신규) createRequireAuth, authOf
  src/routes/auth.ts       (신규) /auth/signup · login · logout
  src/routes/me.ts         (신규) /me GET · PATCH · DELETE
  src/app.ts               (수정) logStream, auth 데코레이터, 라우트 등록
  test/global-setup.ts     (수정) _test 가드
  test/helpers.ts          (수정) assertTestDatabase export
  test/auth-helpers.ts     (신규) IOS/WEB/bearer/signupViaApi/loginViaApi/VALID_PASSWORD
  test/zod-instance.test.ts, logging.test.ts, helpers.test.ts, password.test.ts, auth.test.ts, me.test.ts
apps/app/src/
  api/client.ts            (수정) 타임아웃, token 옵션, getAuthToken, UNAUTHORIZED만 핸들러
  api/auth.ts              (신규) 인증·내 정보 API 함수
  auth/AuthProvider.tsx    (수정) 상태 머신 + user + retry + useCurrentUser
  app/_layout.tsx          (수정) unreachable 화면
  components/Screen.tsx    (수정) 키보드 회피
  components/TextField.tsx, Button.tsx, FormMessage.tsx, ConfirmModal.tsx, ServerUnreachable.tsx (신규)
  app/(auth)/login.tsx, signup.tsx (교체)
  app/(main)/index.tsx, profile.tsx (교체)
```

---

### Task 1: zod 단일 인스턴스화

**Files:**
- Modify: `packages/shared/src/index.ts`, `apps/server/package.json`, `apps/server/src/config.ts`, `apps/server/src/lib/errors.ts`
- Test: `apps/server/test/zod-instance.test.ts`

**Interfaces:**
- Produces: `import { z } from '@haruleaf/shared'` (zod 4.6.5 네임스페이스). 서버의 `isZodError` 제거, `error instanceof z.ZodError` 사용.

- [ ] **Step 1: 실패하는 테스트 작성** — `apps/server/test/zod-instance.test.ts`

```ts
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { platformSchema, z } from '@haruleaf/shared';
import { describe, expect, it } from 'vitest';

const serverDir = fileURLToPath(new URL('..', import.meta.url));

describe('zod 단일 인스턴스', () => {
  it('서버는 zod를 직접 의존하지 않는다', () => {
    const pkg = JSON.parse(readFileSync(`${serverDir}/package.json`, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.zod).toBeUndefined();
    expect(pkg.devDependencies?.zod).toBeUndefined();
    expect(existsSync(`${serverDir}/node_modules/zod`)).toBe(false);
  });

  it('shared 스키마의 오류는 shared가 내보낸 z.ZodError 인스턴스다', () => {
    const result = platformSchema.safeParse('android');
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(z.ZodError);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd ~/HaruLeaf && npm run db:up && npm test -w @haruleaf/server -- test/zod-instance.test.ts`
Expected: FAIL — `z`가 shared에서 export되지 않음(undefined) 및 `pkg.dependencies.zod`가 `^4.6.5`.

- [ ] **Step 3: 구현**

`packages/shared/src/index.ts` 맨 위에 추가:

```ts
export { z } from 'zod';
```

서버 zod 의존성 제거:

```bash
cd ~/HaruLeaf && npm uninstall zod -w @haruleaf/server
```

`apps/server/src/config.ts`: `import { z } from 'zod';` → `import { z } from '@haruleaf/shared';`

`apps/server/src/lib/errors.ts`: 파일 상단 import와 `isZodError`를 다음으로 교체하고, 핸들러의 `if (isZodError(error))`를 `if (error instanceof z.ZodError)`로 바꾼다.

```ts
import { z, type ApiErrorBody } from '@haruleaf/shared';
import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify';
```

(`import { ZodError } from 'zod';`와 `isZodError` 함수 및 그 주석을 삭제.)

- [ ] **Step 4: 통과 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server && npm run typecheck -w @haruleaf/server`
Expected: 전체 PASS(기존 `/__test/shared-zod` 400 VALIDATION_ERROR 테스트 포함), 타입 오류 0. `grep -rn "from 'zod'" apps/server/src apps/server/test` 출력 없음.

- [ ] **Step 5: 커밋**

```bash
cd ~/HaruLeaf
git add packages/shared/src/index.ts apps/server package-lock.json
git commit -m "refactor: zod를 공용 패키지 한 벌로 통일

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 오류 로그 민감정보 제거와 테스트 DB 가드

**Files:**
- Modify: `apps/server/src/lib/errors.ts`, `apps/server/src/app.ts`, `apps/server/test/helpers.ts`, `apps/server/test/global-setup.ts`
- Test: `apps/server/test/logging.test.ts`, `apps/server/test/helpers.test.ts`

**Interfaces:**
- Consumes: `buildApp`, `AppDeps` (기존)
- Produces:
  - `serializeError(error: unknown): { name: string; code?: unknown; constraint?: unknown; table?: unknown; stack?: string }`
  - `AppDeps.logStream?: { write(message: string): void }` — 주어지면 해당 스트림으로 로그(level info)
  - `assertTestDatabase(url: string): void` (helpers에서 export)

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/server/test/logging.test.ts`:

```ts
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { fixedClock } from '../src/lib/clock';
import { serializeError } from '../src/lib/errors';
import { createTestDb } from './helpers';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

describe('500 오류 로그', () => {
  it('DB 오류의 쿼리 파라미터와 메시지를 로그에 남기지 않는다', async () => {
    const lines: string[] = [];
    const app = await buildApp({
      db,
      clock: fixedClock('2026-09-30'),
      corsOrigins: [],
      logStream: { write: (message) => void lines.push(message) },
    });
    app.get('/__test/db-fail', async () => {
      await db.execute(sql`select ${'SECRET-DIARY-BODY'}::int`);
      return { ok: true };
    });
    try {
      const response = await app.inject({ method: 'GET', url: '/__test/db-fail', headers: { 'x-client-platform': 'ios' } });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: { code: 'INTERNAL', message: '잠시 후 다시 시도해주세요.' } });
      const log = lines.join('');
      expect(log).toContain('unhandled error');
      expect(log).toContain('22P02');
      expect(log).not.toContain('SECRET-DIARY-BODY');
    } finally {
      await app.close();
    }
  });
});

describe('serializeError', () => {
  it('name·pg 코드·제약조건·테이블·호출 위치만 남긴다', () => {
    const error = Object.assign(new Error('Failed query: insert ... params: secret-hash'), {
      name: 'DrizzleQueryError',
      cause: { code: '23505', constraint: 'users_login_id_unique', table: 'users', message: 'dup secret-hash' },
    });
    const result = serializeError(error);
    expect(result).toMatchObject({ name: 'DrizzleQueryError', code: '23505', constraint: 'users_login_id_unique', table: 'users' });
    expect(JSON.stringify(result)).not.toContain('secret-hash');
    expect(result.stack).toMatch(/^\s*at /);
  });

  it('Error가 아닌 값도 처리한다', () => {
    expect(serializeError('boom')).toEqual({ name: 'Error', code: undefined, constraint: undefined, table: undefined, stack: undefined });
  });
});
```

`apps/server/test/helpers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { assertTestDatabase } from './helpers';

describe('assertTestDatabase', () => {
  it('_test로 끝나는 DB만 허용한다', () => {
    expect(() => assertTestDatabase('postgres://u:p@localhost:5433/haruleaf_test')).not.toThrow();
    expect(() => assertTestDatabase('postgres://u:p@localhost:5433/haruleaf')).toThrow('_test');
  });

  it('오류 메시지에 비밀번호를 드러내지 않는다', () => {
    expect(() => assertTestDatabase('postgres://u:topsecret@localhost:5433/haruleaf')).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('topsecret') }),
    );
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server -- test/logging.test.ts test/helpers.test.ts`
Expected: FAIL — `serializeError`/`assertTestDatabase` export 없음, `logStream` 무시됨.

- [ ] **Step 3: 구현**

`apps/server/src/lib/errors.ts`에 함수 추가, 500 로그 줄 교체:

```ts
type ErrorLike = {
  name?: unknown;
  code?: unknown;
  stack?: unknown;
  cause?: { code?: unknown; constraint?: unknown; table?: unknown };
};

/** 로그용 오류 요약. DB 오류 message에는 쿼리 파라미터가 들어있어 message는 남기지 않는다. */
export function serializeError(error: unknown) {
  const e = (typeof error === 'object' && error !== null ? error : {}) as ErrorLike;
  const stack =
    typeof e.stack === 'string'
      ? e.stack
          .split('\n')
          .filter((line) => line.trim().startsWith('at '))
          .join('\n')
      : undefined;
  return {
    name: typeof e.name === 'string' ? e.name : 'Error',
    code: e.cause?.code ?? e.code,
    constraint: e.cause?.constraint,
    table: e.cause?.table,
    stack,
  };
}
```

핸들러의 `request.log.error({ err: error }, 'unhandled error');` → `request.log.error({ error: serializeError(error) }, 'unhandled error');`

`apps/server/src/app.ts`: `AppDeps`에 `logStream?: { write(message: string): void };` 추가, Fastify 생성부 교체:

```ts
  const loggerOptions = { redact: ['req.headers.authorization', 'req.body.password', 'req.body.body'] };
  const app = Fastify({
    logger: deps.logStream
      ? { ...loggerOptions, stream: deps.logStream }
      : deps.logger
        ? loggerOptions
        : false,
  });
```

`apps/server/test/helpers.ts`: `function assertTestDatabase` 앞에 `export`를 붙이고, 메시지의 URL 마스킹은 유지.

`apps/server/test/global-setup.ts`:

```ts
import { runMigrations } from '../src/db/migrate';
import { assertTestDatabase, TEST_DATABASE_URL } from './helpers';

export default async function setup(): Promise<void> {
  assertTestDatabase(TEST_DATABASE_URL);
  await runMigrations(TEST_DATABASE_URL);
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server && npm run typecheck -w @haruleaf/server`
Expected: 전체 PASS, 타입 오류 0.

- [ ] **Step 5: 커밋**

```bash
cd ~/HaruLeaf
git add apps/server
git commit -m "fix: 500 오류 로그에서 쿼리 파라미터 제거, 테스트 DB 가드를 global-setup에도 적용

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 공용 인증 스키마·타입·필드 오류 도우미

**Files:**
- Create: `packages/shared/src/auth.ts`, `packages/shared/src/validation.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/auth.test.ts`, `packages/shared/src/validation.test.ts`

**Interfaces:**
- Produces (`@haruleaf/shared`):
  - 메시지 상수: `LOGIN_ID_MESSAGE`, `PASSWORD_LENGTH_MESSAGE`, `PASSWORD_SPACE_MESSAGE`, `PASSWORD_MIX_MESSAGE`, `NICKNAME_MESSAGE`, `PASSWORD_RULE_HELP`
  - `loginIdSchema`, `passwordSchema`, `nicknameSchema`, `signupSchema`, `loginSchema`, `updateNicknameSchema`, `deleteAccountSchema`
  - 타입: `SignupInput`, `LoginInput`, `UpdateNicknameInput`, `DeleteAccountInput`, `User = { id: string; loginId: string; nickname: string; coinBalance: number; createdAt: string }`, `AuthResponse = { token: string; user: User }`, `MeResponse = { user: User }`, `OkResponse = { ok: true }`
  - `firstIssueByField(error: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }> }): Record<string, string>`

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/shared/src/auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  deleteAccountSchema,
  LOGIN_ID_MESSAGE,
  loginIdSchema,
  loginSchema,
  NICKNAME_MESSAGE,
  nicknameSchema,
  PASSWORD_LENGTH_MESSAGE,
  PASSWORD_MIX_MESSAGE,
  PASSWORD_SPACE_MESSAGE,
  passwordSchema,
  signupSchema,
  updateNicknameSchema,
} from './auth';

const firstMessage = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? undefined : result.error?.issues[0]?.message;

describe('loginIdSchema', () => {
  it.each(['abc', 'haru_01', 'a'.repeat(20)])('%s 허용', (value) => {
    expect(loginIdSchema.parse(value)).toBe(value);
  });

  it('앞뒤 공백 제거 후 소문자로 바꾼다', () => {
    expect(loginIdSchema.parse('  Haru_01 ')).toBe('haru_01');
  });

  it.each(['ab', 'a'.repeat(21), 'haru-01', '하루', 'ha ru', ''])('%s 거절', (value) => {
    expect(firstMessage(loginIdSchema.safeParse(value))).toBe(LOGIN_ID_MESSAGE);
  });
});

describe('passwordSchema', () => {
  it.each(['Haru123!', 'A1!' + 'a'.repeat(61), 'ZZ99##zz'])('%s 허용', (value) => {
    expect(passwordSchema.parse(value)).toBe(value);
  });

  it.each([
    ['Ha1!abc', PASSWORD_LENGTH_MESSAGE],
    ['A1!' + 'a'.repeat(62), PASSWORD_LENGTH_MESSAGE],
    ['Haru 123!', PASSWORD_SPACE_MESSAGE],
    ['haru123!', PASSWORD_MIX_MESSAGE],
    ['HaruHaru!', PASSWORD_MIX_MESSAGE],
    ['Haru1234', PASSWORD_MIX_MESSAGE],
  ])('%s → %s', (value, message) => {
    expect(firstMessage(passwordSchema.safeParse(value))).toBe(message);
  });
});

describe('nicknameSchema', () => {
  it('앞뒤 공백을 제거한다', () => {
    expect(nicknameSchema.parse('  진화 ')).toBe('진화');
  });

  it('한글 10자는 허용, 11자는 거절', () => {
    expect(nicknameSchema.parse('가나다라마바사아자차')).toBe('가나다라마바사아자차');
    expect(firstMessage(nicknameSchema.safeParse('가나다라마바사아자차카'))).toBe(NICKNAME_MESSAGE);
  });

  it.each(['', '   '])('빈 값 %j 거절', (value) => {
    expect(firstMessage(nicknameSchema.safeParse(value))).toBe(NICKNAME_MESSAGE);
  });
});

describe('폼 스키마', () => {
  it('signupSchema는 세 필드를 정규화한다', () => {
    expect(signupSchema.parse({ loginId: 'Haru_01', password: 'Haru123!', nickname: ' 진화 ' })).toEqual({
      loginId: 'haru_01',
      password: 'Haru123!',
      nickname: '진화',
    });
  });

  it('signupSchema는 본문이 없으면 한국어 메시지', () => {
    expect(firstMessage(signupSchema.safeParse(undefined))).toBe('입력값을 확인해주세요.');
  });

  it('loginSchema는 형식 규칙 없이 길이만 확인하고 소문자로 바꾼다', () => {
    expect(loginSchema.parse({ loginId: ' NOBODY-X ', password: 'x' })).toEqual({ loginId: 'nobody-x', password: 'x' });
    expect(loginSchema.parse({ loginId: 'a'.repeat(100), password: 'x' }).loginId).toHaveLength(100);
    expect(firstMessage(loginSchema.safeParse({ loginId: '', password: 'x' }))).toBe('아이디를 입력해주세요.');
    expect(firstMessage(loginSchema.safeParse({ loginId: 'a'.repeat(101), password: 'x' }))).toBe('아이디를 확인해주세요.');
    expect(firstMessage(loginSchema.safeParse({ loginId: 'abc', password: '' }))).toBe('비밀번호를 입력해주세요.');
  });

  it('updateNicknameSchema와 deleteAccountSchema', () => {
    expect(updateNicknameSchema.parse({ nickname: '새이름' })).toEqual({ nickname: '새이름' });
    expect(firstMessage(deleteAccountSchema.safeParse({ password: '' }))).toBe('비밀번호를 입력해주세요.');
  });
});
```

`packages/shared/src/validation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { signupSchema } from './auth';
import { firstIssueByField } from './validation';

describe('firstIssueByField', () => {
  it('필드별 첫 오류 메시지만 모은다', () => {
    const result = signupSchema.safeParse({ loginId: 'ab', password: 'short', nickname: '' });
    expect(result.success).toBe(false);
    expect(firstIssueByField(result.error!)).toEqual({
      loginId: '아이디는 영문 소문자·숫자·_ 3~20자로 입력해주세요.',
      password: '비밀번호는 8~64자로 입력해주세요.',
      nickname: '닉네임은 1~10자로 입력해주세요.',
    });
  });

  it('경로가 없는 오류는 건너뛴다', () => {
    expect(firstIssueByField({ issues: [{ path: [], message: 'x' }] })).toEqual({});
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/shared`
Expected: FAIL — `./auth`, `./validation` 모듈 없음.

- [ ] **Step 3: 구현**

`packages/shared/src/auth.ts`:

```ts
import { z } from 'zod';

export const LOGIN_ID_MESSAGE = '아이디는 영문 소문자·숫자·_ 3~20자로 입력해주세요.';
export const PASSWORD_LENGTH_MESSAGE = '비밀번호는 8~64자로 입력해주세요.';
export const PASSWORD_SPACE_MESSAGE = '비밀번호에는 공백을 쓸 수 없어요.';
export const PASSWORD_MIX_MESSAGE = '비밀번호에 대문자·숫자·특수문자를 각각 1자 이상 넣어주세요.';
export const NICKNAME_MESSAGE = '닉네임은 1~10자로 입력해주세요.';
export const PASSWORD_RULE_HELP = '8~64자, 대문자·숫자·특수문자를 각각 1자 이상 넣어주세요.';

const FORM_MESSAGE = '입력값을 확인해주세요.';
const PASSWORD_REQUIRED = '비밀번호를 입력해주세요.';

export const loginIdSchema = z
  .string({ error: LOGIN_ID_MESSAGE })
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, LOGIN_ID_MESSAGE);

export const passwordSchema = z
  .string({ error: PASSWORD_LENGTH_MESSAGE })
  .min(8, PASSWORD_LENGTH_MESSAGE)
  .max(64, PASSWORD_LENGTH_MESSAGE)
  .refine((value) => !/\s/.test(value), PASSWORD_SPACE_MESSAGE)
  .refine(
    (value) => /[A-Z]/.test(value) && /[0-9]/.test(value) && /[^A-Za-z0-9\s]/.test(value),
    PASSWORD_MIX_MESSAGE,
  );

export const nicknameSchema = z
  .string({ error: NICKNAME_MESSAGE })
  .trim()
  .refine((value) => {
    const length = Array.from(value).length;
    return length >= 1 && length <= 10;
  }, NICKNAME_MESSAGE);

const passwordInput = z
  .string({ error: PASSWORD_REQUIRED })
  .min(1, PASSWORD_REQUIRED)
  .max(64, '비밀번호를 확인해주세요.');

export const signupSchema = z.object(
  { loginId: loginIdSchema, password: passwordSchema, nickname: nicknameSchema },
  { error: FORM_MESSAGE },
);

export const loginSchema = z.object(
  {
    loginId: z
      .string({ error: '아이디를 입력해주세요.' })
      .trim()
      .toLowerCase()
      .min(1, '아이디를 입력해주세요.')
      .max(100, '아이디를 확인해주세요.'),
    password: passwordInput,
  },
  { error: FORM_MESSAGE },
);

export const updateNicknameSchema = z.object({ nickname: nicknameSchema }, { error: FORM_MESSAGE });

export const deleteAccountSchema = z.object({ password: passwordInput }, { error: FORM_MESSAGE });

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateNicknameInput = z.infer<typeof updateNicknameSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

export type User = {
  id: string;
  loginId: string;
  nickname: string;
  coinBalance: number;
  /** ISO 8601 */
  createdAt: string;
};

export type AuthResponse = { token: string; user: User };
export type MeResponse = { user: User };
export type OkResponse = { ok: true };
```

`packages/shared/src/validation.ts`:

```ts
type IssueLike = { path: ReadonlyArray<PropertyKey>; message: string };

/** Zod 오류에서 최상위 필드별 첫 메시지만 모은다(폼 칸 아래 표시용). */
export function firstIssueByField(error: { issues: ReadonlyArray<IssueLike> }): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (key === undefined) continue;
    const field = String(key);
    if (!(field in result)) result[field] = issue.message;
  }
  return result;
}
```

`packages/shared/src/index.ts`에 추가:

```ts
export * from './auth';
export * from './validation';
```

- [ ] **Step 4: 통과 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/shared && npm run typecheck`
Expected: shared 전체 PASS, 모든 워크스페이스 타입 오류 0. (zod 4 API가 다르게 동작하면 설치된 `packages/shared/node_modules/zod`의 타입 정의를 확인해 테스트 의도를 유지한 채 최소 수정하고 보고서에 기록.)

- [ ] **Step 5: 커밋**

```bash
cd ~/HaruLeaf
git add packages/shared
git commit -m "feat: 공용 인증 입력 스키마·응답 타입·필드 오류 도우미 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 비밀번호 해시와 세션 토큰 유틸

**Files:**
- Create: `apps/server/src/lib/password.ts`, `apps/server/src/lib/token.ts`
- Test: `apps/server/test/password.test.ts`

**Interfaces:**
- Produces:
  - `hashPassword(password: string): Promise<string>` → `scrypt$<32 hex>$<128 hex>`
  - `verifyPassword(password: string, stored: string): Promise<boolean>` (형식 오류면 false)
  - `dummyPasswordHash(): Promise<string>` (최초 호출 시 1회 생성, 이후 재사용)
  - `createToken(): string` (base64url 43자), `hashToken(token: string): string` (sha256 hex 64자)

- [ ] **Step 1: 실패하는 테스트 작성** — `apps/server/test/password.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { dummyPasswordHash, hashPassword, verifyPassword } from '../src/lib/password';
import { createToken, hashToken } from '../src/lib/token';

describe('password', () => {
  it('scrypt 형식으로 해시하고 원문을 포함하지 않는다', async () => {
    const hash = await hashPassword('Haru123!');
    expect(hash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(hash).not.toContain('Haru123!');
  });

  it('같은 비밀번호도 salt가 달라 해시가 다르다', async () => {
    expect(await hashPassword('Haru123!')).not.toBe(await hashPassword('Haru123!'));
  });

  it('맞는 비밀번호만 통과한다', async () => {
    const hash = await hashPassword('Haru123!');
    expect(await verifyPassword('Haru123!', hash)).toBe(true);
    expect(await verifyPassword('haru123!', hash)).toBe(false);
  });

  it.each(['', 'plain', 'scrypt$zz$zz', 'bcrypt$00$00'])('잘못된 저장 형식 %j는 false', async (stored) => {
    expect(await verifyPassword('Haru123!', stored)).toBe(false);
  });

  it('더미 해시는 한 번만 만들고 어떤 비밀번호와도 일치하지 않는다', async () => {
    const first = await dummyPasswordHash();
    expect(await dummyPasswordHash()).toBe(first);
    expect(await verifyPassword('Haru123!', first)).toBe(false);
  });
});

describe('token', () => {
  it('URL 안전 43자 무작위 토큰', () => {
    const token = createToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createToken()).not.toBe(token);
  });

  it('hashToken은 결정적 sha256 hex', () => {
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashToken('abc')).toHaveLength(64);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server -- test/password.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`apps/server/src/lib/password.ts`:

```ts
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

type ScryptOptions = { N: number; r: number; p: number };
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

const PARAMS: ScryptOptions = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await scrypt(password, salt, KEY_LENGTH, PARAMS);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex || !/^[0-9a-f]+$/.test(saltHex) || !/^[0-9a-f]+$/.test(hashHex)) {
    return false;
  }
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length === 0) return false;
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, PARAMS);
  return timingSafeEqual(expected, actual);
}

let dummy: Promise<string> | undefined;

/** 존재하지 않는 아이디로 로그인할 때도 같은 비용의 검증을 하기 위한 해시. */
export function dummyPasswordHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(32).toString('hex'));
  return dummy;
}
```

`apps/server/src/lib/token.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto';

/** 세션 토큰 원문(기기에만 보관). */
export function createToken(): string {
  return randomBytes(32).toString('base64url');
}

/** DB에는 토큰의 SHA-256 해시만 저장한다. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server -- test/password.test.ts && npm run typecheck -w @haruleaf/server`
Expected: PASS, 타입 오류 0.

- [ ] **Step 5: 커밋**

```bash
cd ~/HaruLeaf
git add apps/server/src/lib/password.ts apps/server/src/lib/token.ts apps/server/test/password.test.ts
git commit -m "feat: scrypt 비밀번호 해시와 세션 토큰 유틸 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 회원가입·로그인·로그아웃 API와 세션 확인

**Files:**
- Create: `apps/server/src/lib/request-meta.ts`, `apps/server/src/domain/accounts.ts`, `apps/server/src/plugins/auth.ts`, `apps/server/src/routes/auth.ts`
- Modify: `apps/server/src/app.ts`
- Create: `apps/server/test/auth-helpers.ts`
- Test: `apps/server/test/auth.test.ts`

**Interfaces:**
- Consumes: shared `signupSchema`, `loginSchema`, `SignupInput`, `LoginInput`, `User`, `AuthResponse`, `OkResponse`, `Platform`; `hashPassword`, `verifyPassword`, `dummyPasswordHash`, `createToken`, `hashToken` (Task 4); `AppError`; 테이블 `users`, `userCredentials`, `plants`, `userPlants`, `sessions`, `authEvents`
- Produces:
  - `type ClientMeta = { platform: Platform; ip: string | null; userAgent: string | null }`, `clientMeta(request): ClientMeta`
  - `SESSION_TTL_MS = 2_592_000_000`
  - `type AuthContext = { userId: string; sessionId: string; loginId: string }`
  - `signup(db, input: SignupInput, meta, now?: Date): Promise<AuthResponse>`
  - `login(db, input: LoginInput, meta, now?: Date): Promise<AuthResponse>`
  - `authenticate(db, token: string, now?: Date): Promise<AuthContext | null>`
  - `logout(db, auth: AuthContext, meta, now?: Date): Promise<void>`
  - `toUser(row): User` (Task 6에서 재사용)
  - `createRequireAuth(db): (request: FastifyRequest) => Promise<void>`, `authOf(request): AuthContext`, `request.auth: AuthContext | null`
  - 테스트 헬퍼: `IOS`, `WEB`, `VALID_PASSWORD = 'Haru123!'`, `bearer(token, headers?)`, `signupViaApi(app, override?, headers?)`, `loginViaApi(app, loginId, password, headers?)`

- [ ] **Step 1: 테스트 헬퍼 작성** — `apps/server/test/auth-helpers.ts`

```ts
import type { FastifyInstance } from 'fastify';

export const IOS = { 'x-client-platform': 'ios' } as const;
export const WEB = { 'x-client-platform': 'web' } as const;
export const VALID_PASSWORD = 'Haru123!';

type PlatformHeaders = typeof IOS | typeof WEB;

export function bearer(token: string, headers: PlatformHeaders = IOS) {
  return { ...headers, authorization: `Bearer ${token}` };
}

export function signupViaApi(
  app: FastifyInstance,
  override: Partial<{ loginId: string; password: string; nickname: string }> = {},
  headers: PlatformHeaders = IOS,
) {
  return app.inject({
    method: 'POST',
    url: '/auth/signup',
    headers,
    payload: { loginId: 'haru_01', password: VALID_PASSWORD, nickname: '진화', ...override },
  });
}

export function loginViaApi(app: FastifyInstance, loginId: string, password: string, headers: PlatformHeaders = IOS) {
  return app.inject({ method: 'POST', url: '/auth/login', headers, payload: { loginId, password } });
}
```

- [ ] **Step 2: 실패하는 테스트 작성** — `apps/server/test/auth.test.ts`

```ts
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { authEvents, sessions, userCredentials, userPlants, users } from '../src/db/schema';
import { seedCatalog } from '../src/db/seed';
import { fixedClock } from '../src/lib/clock';
import { bearer, IOS, loginViaApi, signupViaApi, VALID_PASSWORD, WEB } from './auth-helpers';
import { createTestDb, resetDatabase } from './helpers';

const { db, pool } = createTestDb();
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ db, clock: fixedClock('2026-09-30'), corsOrigins: [] });
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

describe('POST /auth/signup', () => {
  it('계정을 만들고 토큰·사용자·초기 식물 5종을 준다', async () => {
    const response = await signupViaApi(app, { loginId: 'Haru_01' });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.user).toMatchObject({ loginId: 'haru_01', nickname: '진화', coinBalance: 0 });
    expect(Number.isNaN(Date.parse(body.user.createdAt))).toBe(false);
    const owned = await db.select().from(userPlants).where(eq(userPlants.userId, body.user.id));
    expect(owned).toHaveLength(5);
    expect(owned.every((plant) => plant.unlockSource === 'INITIAL')).toBe(true);
  });

  it('비밀번호는 scrypt 해시로만 저장한다', async () => {
    await signupViaApi(app);
    const [credential] = await db.select().from(userCredentials);
    expect(credential!.passwordHash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(credential!.passwordHash).not.toContain(VALID_PASSWORD);
  });

  it('SIGNUP 이벤트와 세션에 플랫폼을 기록하고 세션은 30일 뒤 만료', async () => {
    await signupViaApi(app, {}, WEB);
    const [event] = await db.select().from(authEvents);
    expect(event).toMatchObject({ event: 'SIGNUP', platform: 'web', loginId: 'haru_01' });
    expect(event!.userAgent).toBeTruthy();
    const [session] = await db.select().from(sessions);
    expect(session!.platform).toBe('web');
    expect(session!.expiresAt.getTime() - session!.createdAt.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('이미 있는 아이디는 409 LOGIN_ID_TAKEN', async () => {
    await signupViaApi(app);
    const response = await signupViaApi(app, { loginId: 'HARU_01', nickname: '다른사람' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { code: 'LOGIN_ID_TAKEN', message: '이미 사용 중인 아이디입니다.' } });
  });

  it('같은 아이디로 동시에 가입하면 1건만 성공한다', async () => {
    const results = await Promise.all([signupViaApi(app), signupViaApi(app)]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([201, 409]);
    expect(await db.select().from(users)).toHaveLength(1);
    expect(await db.select().from(userPlants)).toHaveLength(5);
  });

  it.each([
    [{ loginId: 'ab' }, '아이디는 영문 소문자·숫자·_ 3~20자로 입력해주세요.'],
    [{ password: 'haru1234!' }, '비밀번호에 대문자·숫자·특수문자를 각각 1자 이상 넣어주세요.'],
    [{ password: 'Ha1!' }, '비밀번호는 8~64자로 입력해주세요.'],
    [{ nickname: '   ' }, '닉네임은 1~10자로 입력해주세요.'],
  ])('규칙 위반 %j → 400 한국어 메시지, 저장 안 함', async (override, message) => {
    const response = await signupViaApi(app, override);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: 'VALIDATION_ERROR', message } });
    expect(await db.select().from(users)).toHaveLength(0);
  });
});

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await signupViaApi(app);
  });

  it('성공하면 새 세션 토큰과 LOGIN_SUCCESS 기록', async () => {
    const response = await loginViaApi(app, ' HARU_01 ', VALID_PASSWORD, WEB);
    expect(response.statusCode).toBe(200);
    expect(response.json().user.loginId).toBe('haru_01');
    expect(response.json().token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const events = await db.select().from(authEvents).where(eq(authEvents.event, 'LOGIN_SUCCESS'));
    expect(events).toHaveLength(1);
    expect(events[0]!.platform).toBe('web');
    expect(await db.select().from(sessions)).toHaveLength(2);
  });

  it('틀린 비밀번호와 없는 아이디는 같은 401 응답', async () => {
    const wrong = await loginViaApi(app, 'haru_01', 'Wrong123!');
    const unknown = await loginViaApi(app, 'nobody_x', VALID_PASSWORD);
    const expected = { error: { code: 'INVALID_CREDENTIALS', message: '아이디 또는 비밀번호가 올바르지 않습니다.' } };
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(expected);
    expect(unknown.json()).toEqual(expected);
  });

  it('실패를 기록한다 — 있는 아이디는 user_id, 없는 아이디는 NULL, 긴 입력은 30자', async () => {
    const [user] = await db.select().from(users);
    await loginViaApi(app, 'haru_01', 'Wrong123!');
    await loginViaApi(app, 'nobody_x', VALID_PASSWORD);
    await loginViaApi(app, 'x'.repeat(40), VALID_PASSWORD);
    const failed = await db.select().from(authEvents).where(eq(authEvents.event, 'LOGIN_FAILED')).orderBy(authEvents.id);
    expect(failed.map((event) => [event.userId, event.loginId])).toEqual([
      [user!.id, 'haru_01'],
      [null, 'nobody_x'],
      [null, 'x'.repeat(30)],
    ]);
  });
});

describe('POST /auth/logout', () => {
  it('현재 세션을 폐기하고 LOGOUT을 기록한다', async () => {
    const { token } = (await signupViaApi(app)).json();
    const first = await app.inject({ method: 'POST', url: '/auth/logout', headers: bearer(token) });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ ok: true });
    const [session] = await db.select().from(sessions);
    expect(session!.revokedAt).not.toBeNull();
    const logoutEvents = await db.select().from(authEvents).where(eq(authEvents.event, 'LOGOUT'));
    expect(logoutEvents).toHaveLength(1);
    expect(logoutEvents[0]!.platform).toBe('ios');

    const again = await app.inject({ method: 'POST', url: '/auth/logout', headers: bearer(token) });
    expect(again.statusCode).toBe(401);
    expect(again.json()).toEqual({ error: { code: 'UNAUTHORIZED', message: '다시 로그인해주세요.' } });
  });

  it('토큰이 없거나 잘못되면 401', async () => {
    expect((await app.inject({ method: 'POST', url: '/auth/logout', headers: IOS })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/auth/logout', headers: bearer('not-a-token') })).statusCode).toBe(401);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server -- test/auth.test.ts`
Expected: FAIL — `/auth/*` 경로가 없어 404.

- [ ] **Step 4: 구현**

`apps/server/src/lib/request-meta.ts`:

```ts
import type { Platform } from '@haruleaf/shared';
import type { FastifyRequest } from 'fastify';

export type ClientMeta = { platform: Platform; ip: string | null; userAgent: string | null };

const USER_AGENT_MAX = 300;

export function clientMeta(request: FastifyRequest): ClientMeta {
  const userAgent = request.headers['user-agent'];
  return {
    platform: request.platform,
    ip: request.ip || null,
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, USER_AGENT_MAX) : null,
  };
}
```

`apps/server/src/domain/accounts.ts`:

```ts
import type { AuthResponse, LoginInput, SignupInput, User } from '@haruleaf/shared';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { authEvents, plants, sessions, userCredentials, userPlants, users } from '../db/schema';
import { AppError } from '../lib/errors';
import { dummyPasswordHash, hashPassword, verifyPassword } from '../lib/password';
import type { ClientMeta } from '../lib/request-meta';
import { createToken, hashToken } from '../lib/token';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EVENT_LOGIN_ID_MAX = 30;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;
type AuthEvent = 'SIGNUP' | 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'LOGOUT';

export type AuthContext = { userId: string; sessionId: string; loginId: string };

export function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    loginId: row.loginId,
    nickname: row.nickname,
    coinBalance: row.coinBalance,
    createdAt: row.createdAt.toISOString(),
  };
}

async function issueSession(tx: Executor, userId: string, meta: ClientMeta, now: Date): Promise<string> {
  const token = createToken();
  await tx.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    platform: meta.platform,
    createdAt: now,
    lastUsedAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  });
  return token;
}

async function recordEvent(tx: Executor, event: AuthEvent, loginId: string, userId: string | null, meta: ClientMeta) {
  await tx.insert(authEvents).values({
    userId,
    loginId: loginId.slice(0, EVENT_LOGIN_ID_MAX),
    event,
    platform: meta.platform,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

function isLoginIdTaken(error: unknown): boolean {
  const e = error as { code?: unknown; constraint?: unknown; cause?: { code?: unknown; constraint?: unknown } };
  const code = e?.cause?.code ?? e?.code;
  const constraint = e?.cause?.constraint ?? e?.constraint;
  return code === '23505' && constraint === 'users_login_id_unique';
}

export async function signup(db: Db, input: SignupInput, meta: ClientMeta, now = new Date()): Promise<AuthResponse> {
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ loginId: input.loginId, nickname: input.nickname, createdAt: now, updatedAt: now })
        .returning();
      if (!user) throw new Error('사용자 생성 결과가 비어 있습니다.');
      await tx.insert(userCredentials).values({ userId: user.id, passwordHash, updatedAt: now });
      const initialPlants = await tx
        .select({ id: plants.id })
        .from(plants)
        .where(and(eq(plants.initialFree, true), eq(plants.isActive, true)));
      if (initialPlants.length > 0) {
        await tx
          .insert(userPlants)
          .values(initialPlants.map((plant) => ({ userId: user.id, plantId: plant.id, unlockSource: 'INITIAL', unlockedAt: now })));
      }
      const token = await issueSession(tx, user.id, meta, now);
      await recordEvent(tx, 'SIGNUP', user.loginId, user.id, meta);
      return { token, user: toUser(user) };
    });
  } catch (error) {
    if (isLoginIdTaken(error)) throw new AppError('LOGIN_ID_TAKEN', '이미 사용 중인 아이디입니다.', 409);
    throw error;
  }
}

export async function login(db: Db, input: LoginInput, meta: ClientMeta, now = new Date()): Promise<AuthResponse> {
  const [row] = await db
    .select({ user: users, passwordHash: userCredentials.passwordHash })
    .from(users)
    .innerJoin(userCredentials, eq(userCredentials.userId, users.id))
    .where(eq(users.loginId, input.loginId))
    .limit(1);
  const valid = await verifyPassword(input.password, row?.passwordHash ?? (await dummyPasswordHash()));
  if (!row || !valid) {
    await recordEvent(db, 'LOGIN_FAILED', input.loginId, row?.user.id ?? null, meta);
    throw new AppError('INVALID_CREDENTIALS', '아이디 또는 비밀번호가 올바르지 않습니다.', 401);
  }
  return db.transaction(async (tx) => {
    const token = await issueSession(tx, row.user.id, meta, now);
    await recordEvent(tx, 'LOGIN_SUCCESS', row.user.loginId, row.user.id, meta);
    return { token, user: toUser(row.user) };
  });
}

export async function authenticate(db: Db, token: string, now = new Date()): Promise<AuthContext | null> {
  const [row] = await db
    .select({ sessionId: sessions.id, userId: users.id, loginId: users.loginId })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row) return null;
  await db.update(sessions).set({ lastUsedAt: now }).where(eq(sessions.id, row.sessionId));
  return row;
}

export async function logout(db: Db, auth: AuthContext, meta: ClientMeta, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, auth.sessionId));
    await recordEvent(tx, 'LOGOUT', auth.loginId, auth.userId, meta);
  });
}
```

`apps/server/src/plugins/auth.ts`:

```ts
import type { FastifyRequest } from 'fastify';
import type { Db } from '../db/client';
import { authenticate, type AuthContext } from '../domain/accounts';
import { AppError } from '../lib/errors';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

const unauthorized = () => new AppError('UNAUTHORIZED', '다시 로그인해주세요.', 401);

/** Authorization: Bearer <token>이 유효한 세션이면 request.auth를 채운다. */
export function createRequireAuth(db: Db) {
  return async function requireAuth(request: FastifyRequest): Promise<void> {
    const header = request.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    const auth = token ? await authenticate(db, token) : null;
    if (!auth) throw unauthorized();
    request.auth = auth;
  };
}

export type RequireAuth = ReturnType<typeof createRequireAuth>;

export function authOf(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthorized();
  return request.auth;
}
```

`apps/server/src/routes/auth.ts`:

```ts
import { loginSchema, signupSchema, type OkResponse } from '@haruleaf/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '../db/client';
import { login, logout, signup } from '../domain/accounts';
import { clientMeta } from '../lib/request-meta';
import { authOf, type RequireAuth } from '../plugins/auth';

export const authRoutes: FastifyPluginAsync<{ db: Db; requireAuth: RequireAuth }> = async (app, { db, requireAuth }) => {
  app.post('/auth/signup', async (request, reply) => {
    const input = signupSchema.parse(request.body);
    const result = await signup(db, input, clientMeta(request));
    return reply.status(201).send(result);
  });

  app.post('/auth/login', async (request) => {
    const input = loginSchema.parse(request.body);
    return login(db, input, clientMeta(request));
  });

  app.post('/auth/logout', { preHandler: requireAuth }, async (request): Promise<OkResponse> => {
    await logout(db, authOf(request), clientMeta(request));
    return { ok: true };
  });
};
```

`apps/server/src/app.ts` 수정 — import 추가:

```ts
import { createRequireAuth } from './plugins/auth';
import { authRoutes } from './routes/auth';
```

`app.decorateRequest('platform', 'web');` 아래에 `app.decorateRequest('auth', null);` 추가, `await app.register(healthRoutes, …)` 아래에:

```ts
  const requireAuth = createRequireAuth(deps.db);
  await app.register(authRoutes, { db: deps.db, requireAuth });
```

- [ ] **Step 5: 통과 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server && npm run typecheck -w @haruleaf/server`
Expected: 전체 PASS, 타입 오류 0. (drizzle API가 계획과 다르면 설치된 타입을 확인해 의미를 유지한 채 최소 수정하고 보고서에 기록.)

- [ ] **Step 6: 커밋**

```bash
cd ~/HaruLeaf
git add apps/server
git commit -m "feat: 회원가입·로그인·로그아웃 API와 세션 확인 플러그인 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 내 정보 조회·닉네임 수정·회원탈퇴 API

**Files:**
- Modify: `apps/server/src/domain/accounts.ts` (함수 추가), `apps/server/src/app.ts`
- Create: `apps/server/src/routes/me.ts`
- Test: `apps/server/test/me.test.ts`

**Interfaces:**
- Consumes: `toUser`, `AuthContext`, `createRequireAuth`, `authOf`, `RequireAuth` (Task 5); shared `updateNicknameSchema`, `deleteAccountSchema`, `MeResponse`, `OkResponse`; 테스트 헬퍼 (Task 5)
- Produces:
  - `getUser(db, userId): Promise<User>` (없으면 401 UNAUTHORIZED)
  - `updateNickname(db, userId, nickname, now?): Promise<User>`
  - `deleteAccount(db, userId, password): Promise<void>` (틀리면 401 INVALID_PASSWORD)
  - `GET /me`, `PATCH /me`, `DELETE /me`

- [ ] **Step 1: 실패하는 테스트 작성** — `apps/server/test/me.test.ts`

```ts
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { authEvents, sessions, userCredentials, userPlants, users } from '../src/db/schema';
import { seedCatalog } from '../src/db/seed';
import { fixedClock } from '../src/lib/clock';
import { bearer, IOS, loginViaApi, signupViaApi, VALID_PASSWORD, WEB } from './auth-helpers';
import { createTestDb, resetDatabase } from './helpers';

const { db, pool } = createTestDb();
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ db, clock: fixedClock('2026-09-30'), corsOrigins: [] });
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

const getMe = (token: string) => app.inject({ method: 'GET', url: '/me', headers: bearer(token) });

describe('세션', () => {
  it('토큰이 없거나 잘못되면 401 UNAUTHORIZED', async () => {
    const missing = await app.inject({ method: 'GET', url: '/me', headers: IOS });
    expect(missing.statusCode).toBe(401);
    expect(missing.json()).toEqual({ error: { code: 'UNAUTHORIZED', message: '다시 로그인해주세요.' } });
    expect((await getMe('nope')).statusCode).toBe(401);
  });

  it('두 기기 중 한쪽을 로그아웃해도 다른 쪽은 유지된다', async () => {
    const phone = (await signupViaApi(app)).json().token as string;
    const web = (await loginViaApi(app, 'haru_01', VALID_PASSWORD, WEB)).json().token as string;
    await app.inject({ method: 'POST', url: '/auth/logout', headers: bearer(phone) });
    expect((await getMe(phone)).statusCode).toBe(401);
    expect((await getMe(web)).statusCode).toBe(200);
  });

  it('만료된 세션은 401', async () => {
    const token = (await signupViaApi(app)).json().token as string;
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await getMe(token)).statusCode).toBe(401);
  });

  it('사용할 때마다 last_used_at을 갱신한다', async () => {
    const token = (await signupViaApi(app)).json().token as string;
    const old = new Date('2026-01-01T00:00:00Z');
    await db.update(sessions).set({ lastUsedAt: old });
    await getMe(token);
    const [session] = await db.select().from(sessions);
    expect(session!.lastUsedAt.getTime()).toBeGreaterThan(old.getTime());
  });
});

describe('GET /me', () => {
  it('각 토큰은 자기 정보만 받는다', async () => {
    const a = (await signupViaApi(app)).json().token as string;
    const b = (await signupViaApi(app, { loginId: 'haru_02', nickname: '둘' })).json().token as string;
    expect((await getMe(a)).json().user).toMatchObject({ loginId: 'haru_01', nickname: '진화', coinBalance: 0 });
    expect((await getMe(b)).json().user).toMatchObject({ loginId: 'haru_02', nickname: '둘' });
  });
});

describe('PATCH /me', () => {
  it('닉네임을 바꾸고 다른 기기에서도 보인다', async () => {
    const phone = (await signupViaApi(app)).json().token as string;
    const web = (await loginViaApi(app, 'haru_01', VALID_PASSWORD, WEB)).json().token as string;
    const response = await app.inject({ method: 'PATCH', url: '/me', headers: bearer(web, WEB), payload: { nickname: ' 새잎 ' } });
    expect(response.statusCode).toBe(200);
    expect(response.json().user.nickname).toBe('새잎');
    expect((await getMe(phone)).json().user.nickname).toBe('새잎');
  });

  it('규칙 위반은 400 한국어 메시지', async () => {
    const token = (await signupViaApi(app)).json().token as string;
    const response = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: bearer(token),
      payload: { nickname: '가나다라마바사아자차카' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: 'VALIDATION_ERROR', message: '닉네임은 1~10자로 입력해주세요.' } });
  });
});

describe('DELETE /me', () => {
  it('비밀번호가 틀리면 401 INVALID_PASSWORD이고 아무것도 지우지 않는다', async () => {
    const token = (await signupViaApi(app)).json().token as string;
    const response = await app.inject({ method: 'DELETE', url: '/me', headers: bearer(token), payload: { password: 'Wrong123!' } });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: { code: 'INVALID_PASSWORD', message: '비밀번호가 올바르지 않습니다.' } });
    expect(await db.select().from(users)).toHaveLength(1);
    expect((await getMe(token)).statusCode).toBe(200);
  });

  it('탈퇴하면 계정과 연결 데이터가 모두 지워지고 같은 아이디로 다시 가입할 수 있다', async () => {
    const mine = (await signupViaApi(app)).json();
    await signupViaApi(app, { loginId: 'other_user', nickname: '남' });

    const response = await app.inject({ method: 'DELETE', url: '/me', headers: bearer(mine.token), payload: { password: VALID_PASSWORD } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });

    const id = mine.user.id as string;
    expect(await db.select().from(users).where(eq(users.id, id))).toHaveLength(0);
    expect(await db.select().from(userCredentials).where(eq(userCredentials.userId, id))).toHaveLength(0);
    expect(await db.select().from(sessions).where(eq(sessions.userId, id))).toHaveLength(0);
    expect(await db.select().from(userPlants).where(eq(userPlants.userId, id))).toHaveLength(0);
    expect(await db.select().from(authEvents).where(eq(authEvents.userId, id))).toHaveLength(0);
    expect(await db.select().from(users)).toHaveLength(1);

    expect((await getMe(mine.token)).statusCode).toBe(401);
    expect((await signupViaApi(app)).statusCode).toBe(201);
  });
});

describe('민감정보 로그', () => {
  it('가입·로그인·탈퇴 로그에 비밀번호와 토큰이 없다', async () => {
    const lines: string[] = [];
    const logged = await buildApp({
      db,
      clock: fixedClock('2026-09-30'),
      corsOrigins: [],
      logStream: { write: (message) => void lines.push(message) },
    });
    try {
      const { token } = (await signupViaApi(logged)).json();
      const second = (await loginViaApi(logged, 'haru_01', VALID_PASSWORD)).json().token as string;
      await logged.inject({ method: 'DELETE', url: '/me', headers: bearer(second), payload: { password: VALID_PASSWORD } });
      const log = lines.join('');
      expect(log.length).toBeGreaterThan(0);
      expect(log).not.toContain(VALID_PASSWORD);
      expect(log).not.toContain(token);
      expect(log).not.toContain(second);
      expect(log).not.toContain('scrypt$');
    } finally {
      await logged.close();
    }
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server -- test/me.test.ts`
Expected: FAIL — `/me` 경로 404.

- [ ] **Step 3: 구현**

`apps/server/src/domain/accounts.ts`에 함수 추가:

```ts
const unauthorized = () => new AppError('UNAUTHORIZED', '다시 로그인해주세요.', 401);

export async function getUser(db: Db, userId: string): Promise<User> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) throw unauthorized();
  return toUser(row);
}

export async function updateNickname(db: Db, userId: string, nickname: string, now = new Date()): Promise<User> {
  const [row] = await db.update(users).set({ nickname, updatedAt: now }).where(eq(users.id, userId)).returning();
  if (!row) throw unauthorized();
  return toUser(row);
}

/** 비밀번호 재확인 후 계정을 지운다. 연결된 데이터는 FK CASCADE로 함께 삭제된다. */
export async function deleteAccount(db: Db, userId: string, password: string): Promise<void> {
  const [credential] = await db
    .select({ passwordHash: userCredentials.passwordHash })
    .from(userCredentials)
    .where(eq(userCredentials.userId, userId))
    .limit(1);
  if (!credential) throw unauthorized();
  if (!(await verifyPassword(password, credential.passwordHash))) {
    throw new AppError('INVALID_PASSWORD', '비밀번호가 올바르지 않습니다.', 401);
  }
  await db.delete(users).where(eq(users.id, userId));
}
```

`apps/server/src/routes/me.ts`:

```ts
import { deleteAccountSchema, updateNicknameSchema, type MeResponse, type OkResponse } from '@haruleaf/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '../db/client';
import { deleteAccount, getUser, updateNickname } from '../domain/accounts';
import { authOf, type RequireAuth } from '../plugins/auth';

export const meRoutes: FastifyPluginAsync<{ db: Db; requireAuth: RequireAuth }> = async (app, { db, requireAuth }) => {
  app.get('/me', { preHandler: requireAuth }, async (request): Promise<MeResponse> => ({
    user: await getUser(db, authOf(request).userId),
  }));

  app.patch('/me', { preHandler: requireAuth }, async (request): Promise<MeResponse> => {
    const { nickname } = updateNicknameSchema.parse(request.body);
    return { user: await updateNickname(db, authOf(request).userId, nickname) };
  });

  app.delete('/me', { preHandler: requireAuth }, async (request): Promise<OkResponse> => {
    const { password } = deleteAccountSchema.parse(request.body);
    await deleteAccount(db, authOf(request).userId, password);
    return { ok: true };
  });
};
```

`apps/server/src/app.ts`: `import { meRoutes } from './routes/me';` 추가, authRoutes 등록 다음 줄에 `await app.register(meRoutes, { db: deps.db, requireAuth });`

- [ ] **Step 4: 통과 확인**

Run: `cd ~/HaruLeaf && npm test -w @haruleaf/server && npm run typecheck -w @haruleaf/server`
Expected: 전체 PASS, 타입 오류 0.

- [ ] **Step 5: 커밋**

```bash
cd ~/HaruLeaf
git add apps/server
git commit -m "feat: 내 정보 조회·닉네임 수정·회원탈퇴 API 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 앱 인증 기반 — API 클라이언트·인증 상태·공용 폼 컴포넌트

**Files:**
- Modify: `apps/app/src/api/client.ts`, `apps/app/src/auth/AuthProvider.tsx`, `apps/app/src/app/_layout.tsx`, `apps/app/src/components/Screen.tsx`
- Create: `apps/app/src/api/auth.ts`, `apps/app/src/components/Button.tsx`, `TextField.tsx`, `FormMessage.tsx`, `ConfirmModal.tsx`, `ServerUnreachable.tsx`

**Interfaces:**
- Consumes: shared `AuthResponse`, `MeResponse`, `OkResponse`, `User`, `SignupInput`, `LoginInput`, `UpdateNicknameInput`, `DeleteAccountInput`, `PLATFORM_HEADER`, `ApiErrorBody`; 서버 API (Task 5·6)
- Produces (Task 8이 사용):
  - `apiRequest<T>(path, { method?, body?, token? })` — `token` 생략 시 세션 토큰 사용, `null`이면 토큰 없이
  - `getAuthToken(): string | null`
  - `signupRequest(input)`, `loginRequest(input)`, `logoutRequest(token)`, `fetchMe(token?)`, `updateNicknameRequest(input)`, `deleteAccountRequest(input)`
  - `type AuthState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: User } | { status: 'unreachable'; message: string }`
  - `useAuth(): { state: AuthState; signIn(auth: AuthResponse): Promise<void>; signOut(): Promise<void>; setUser(user: User): void; retry(): void }`
  - `useCurrentUser(): User | null`
  - `<Button title onPress variant? loading? disabled?>`, `<TextField label value onChangeText error? help? secure? …>`, `<FormMessage tone message>`, `<ConfirmModal visible title description confirmLabel onConfirm onCancel loading? confirmVariant? children?>`, `<ServerUnreachable message onRetry>`

- [ ] **Step 1: API 클라이언트 교체** — `apps/app/src/api/client.ts`

```ts
import { PLATFORM_HEADER, type ApiErrorBody } from '@haruleaf/shared';
import { Platform } from 'react-native';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

const REQUEST_TIMEOUT_MS = 10_000;

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

export function getAuthToken(): string | null {
  return authToken;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** 생략하면 현재 세션 토큰을 쓴다. 명시하면 그 토큰(null이면 토큰 없이)으로 요청한다. */
  token?: string | null;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const usesSessionToken = options.token === undefined;
  const token = usesSessionToken ? authToken : options.token;
  const headers: Record<string, string> = {
    [PLATFORM_HEADER]: Platform.OS === 'web' ? 'web' : 'ios',
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new ApiError('TIMEOUT', '서버 응답이 늦어요. 잠시 후 다시 시도해주세요.', 0);
    }
    throw new ApiError('NETWORK_ERROR', '서버에 연결할 수 없어요. 네트워크와 서버 상태를 확인해주세요.', 0);
  } finally {
    clearTimeout(timer);
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (data as ApiErrorBody | null)?.error;
    const code = error?.code ?? 'UNKNOWN';
    if (response.status === 401 && usesSessionToken && token && code === 'UNAUTHORIZED') unauthorizedHandler?.();
    throw new ApiError(code, error?.message ?? '요청을 처리하지 못했어요.', response.status);
  }
  return data as T;
}
```

- [ ] **Step 2: 인증 API 함수** — `apps/app/src/api/auth.ts`

```ts
import type {
  AuthResponse,
  DeleteAccountInput,
  LoginInput,
  MeResponse,
  OkResponse,
  SignupInput,
  UpdateNicknameInput,
} from '@haruleaf/shared';
import { apiRequest } from './client';

export const signupRequest = (input: SignupInput) =>
  apiRequest<AuthResponse>('/auth/signup', { method: 'POST', body: input, token: null });

export const loginRequest = (input: LoginInput) =>
  apiRequest<AuthResponse>('/auth/login', { method: 'POST', body: input, token: null });

export const logoutRequest = (token: string) => apiRequest<OkResponse>('/auth/logout', { method: 'POST', token });

export const fetchMe = (token?: string) => apiRequest<MeResponse>('/me', token === undefined ? {} : { token });

export const updateNicknameRequest = (input: UpdateNicknameInput) =>
  apiRequest<MeResponse>('/me', { method: 'PATCH', body: input });

export const deleteAccountRequest = (input: DeleteAccountInput) =>
  apiRequest<OkResponse>('/me', { method: 'DELETE', body: input });
```

- [ ] **Step 3: 인증 상태 교체** — `apps/app/src/auth/AuthProvider.tsx`

```tsx
import type { AuthResponse, User } from '@haruleaf/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchMe, logoutRequest } from '@/api/auth';
import { ApiError, getAuthToken, setAuthToken, setUnauthorizedHandler } from '@/api/client';
import { clearToken, loadToken, saveToken } from './tokenStore';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; user: User }
  | { status: 'unreachable'; message: string };

type AuthContextValue = {
  state: AuthState;
  signIn: (auth: AuthResponse) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: User) => void;
  retry: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function clearStoredToken(): Promise<void> {
  try {
    await clearToken();
  } catch {
    // 저장소 삭제 실패는 무시한다. 메모리 상태는 이미 로그아웃이다.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  // 초기 상태가 loading이므로 여기서는 동기적으로 상태를 바꾸지 않는다(이펙트 안 setState 방지).
  const restore = useCallback(async () => {
    const token = await loadToken();
    if (!token) {
      setState({ status: 'signedOut' });
      return;
    }
    try {
      const { user } = await fetchMe(token);
      setAuthToken(token);
      setState({ status: 'signedIn', user });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setAuthToken(null);
        await clearStoredToken();
        setState({ status: 'signedOut' });
        return;
      }
      setState({
        status: 'unreachable',
        message: error instanceof ApiError ? error.message : '서버에 연결할 수 없어요.',
      });
    }
  }, []);

  useEffect(() => {
    void restore();
  }, [restore]);

  const signIn = useCallback(async (auth: AuthResponse) => {
    setAuthToken(auth.token);
    setState({ status: 'signedIn', user: auth.user });
    // 저장 실패 시에도 이번 실행 동안은 로그인 상태를 유지한다(다음 실행 때 다시 로그인).
    await saveToken(auth.token).catch(() => undefined);
  }, []);

  const signOut = useCallback(async () => {
    const token = getAuthToken();
    setAuthToken(null);
    setState({ status: 'signedOut' });
    await clearStoredToken();
    if (token) await logoutRequest(token).catch(() => undefined);
  }, []);

  const setUser = useCallback((user: User) => {
    setState((current) => (current.status === 'signedIn' ? { status: 'signedIn', user } : current));
  }, []);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    void restore();
  }, [restore]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  const value = useMemo(() => ({ state, signIn, signOut, setUser, retry }), [state, signIn, signOut, setUser, retry]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있습니다.');
  return value;
}

/** 로그인 상태면 사용자, 아니면 null(로그아웃 전환 중 잠깐 null일 수 있음). */
export function useCurrentUser(): User | null {
  const { state } = useAuth();
  return state.status === 'signedIn' ? state.user : null;
}
```

- [ ] **Step 4: 공용 컴포넌트 작성**

`apps/app/src/components/Button.tsx`:

```tsx
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ title, onPress, variant = 'primary', loading = false, disabled = false }: Props) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.base, styles[variant], inactive && styles.inactive, pressed && !inactive && styles.pressed]}>
      <Text style={[styles.text, variant === 'secondary' ? styles.textSecondary : styles.textOnColor]}>
        {loading ? '처리 중…' : title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.border },
  danger: { backgroundColor: colors.danger },
  inactive: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  text: { fontSize: fontSize.body, fontWeight: '600' },
  textOnColor: { color: colors.surface },
  textSecondary: { color: colors.text },
});
```

`apps/app/src/components/TextField.tsx`:

```tsx
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

type Props = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string | null;
  help?: string;
  /** 비밀번호 칸: 입력을 가리고 보기/숨기기 버튼을 둔다 */
  secure?: boolean;
} & Pick<TextInputProps, 'autoComplete' | 'textContentType' | 'returnKeyType' | 'onSubmitEditing' | 'editable' | 'maxLength'>;

export function TextField({ label, error, help, secure = false, ...inputProps }: Props) {
  const [hidden, setHidden] = useState(secure);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputRow, error ? styles.inputRowError : null]}>
        <TextInput
          style={styles.input}
          accessibilityLabel={label}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={secure && hidden}
          placeholderTextColor={colors.textMuted}
          {...inputProps}
        />
        {secure && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? `${label} 보기` : `${label} 숨기기`}
            onPress={() => setHidden((value) => !value)}
            style={styles.toggle}>
            <Text style={styles.toggleText}>{hidden ? '보기' : '숨기기'}</Text>
          </Pressable>
        )}
      </View>
      {help ? <Text style={styles.help}>{help}</Text> : null}
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.caption, fontWeight: '600', color: colors.text },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  inputRowError: { borderColor: colors.danger },
  input: { flex: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: fontSize.body, color: colors.text },
  toggle: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  toggleText: { fontSize: fontSize.caption, fontWeight: '600', color: colors.primary },
  help: { fontSize: fontSize.caption, color: colors.textMuted },
  error: { fontSize: fontSize.caption, color: colors.danger },
});
```

`apps/app/src/components/FormMessage.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

export function FormMessage({ tone, message }: { tone: 'error' | 'success'; message: string }) {
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.box, tone === 'error' ? styles.error : styles.success]}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  error: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  success: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  text: { fontSize: fontSize.body, color: colors.text },
});
```

`apps/app/src/components/ConfirmModal.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';
import { Button } from './Button';

type Props = {
  visible: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  confirmVariant?: 'primary' | 'danger';
  children?: ReactNode;
};

/** iOS·Web에서 같은 모양으로 뜨는 확인 창(Alert는 Web 미지원). */
export function ConfirmModal({
  visible,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  loading = false,
  confirmVariant = 'primary',
  children,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.description}>{description}</Text>
          {children}
          <View style={styles.actions}>
            <Button title="취소" variant="secondary" onPress={onCancel} disabled={loading} />
            <Button title={confirmLabel} variant={confirmVariant} onPress={onConfirm} loading={loading} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(38, 59, 49, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.lg },
  title: { fontSize: fontSize.heading, fontWeight: '700', color: colors.text },
  description: { fontSize: fontSize.body, color: colors.textMuted, lineHeight: 24 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md },
});
```

`apps/app/src/components/ServerUnreachable.tsx`:

```tsx
import { StyleSheet, Text } from 'react-native';
import { colors, fontSize } from '@/theme/tokens';
import { Button } from './Button';
import { Screen } from './Screen';

export function ServerUnreachable({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        서버에 연결할 수 없어요
      </Text>
      <Text style={styles.description}>{message}</Text>
      <Button title="다시 시도" onPress={onRetry} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  description: { fontSize: fontSize.body, color: colors.textMuted, lineHeight: 24 },
});
```

`apps/app/src/components/Screen.tsx` 교체(키보드 회피 + 입력 중 탭 유지):

```tsx
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, MAX_CONTENT_WIDTH, spacing } from '@/theme/tokens';

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center' },
  content: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, padding: spacing.xl, gap: spacing.lg },
});
```

- [ ] **Step 5: 루트 레이아웃 교체** — `apps/app/src/app/_layout.tsx`

```tsx
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { ServerUnreachable } from '@/components/ServerUnreachable';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { state, retry } = useAuth();

  useEffect(() => {
    if (state.status !== 'loading') void SplashScreen.hideAsync();
  }, [state.status]);

  if (state.status === 'loading') return null;
  if (state.status === 'unreachable') return <ServerUnreachable message={state.message} onRetry={retry} />;

  const signedIn = state.status === 'signedIn';
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(main)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
```

- [ ] **Step 6: 타입체크·lint와 동작 확인**

Run: `cd ~/HaruLeaf && npm run typecheck && npm run lint`
Expected: 오류 0. (기존 `(auth)/login.tsx` 등은 `useAuth().status`를 쓰지 않으므로 그대로 컴파일되어야 한다. 컴파일 오류가 나는 화면이 있으면 Task 8에서 교체될 파일이라도 이번 커밋에서 최소 수정으로 통과시킨다.)

동작 확인: `npm run db:up`, 서버를 켜지 않은 상태로 `cd apps/app && npx expo start --web --port 8081` → 브라우저 `http://localhost:8081`에서 로그인 자리표시 화면(저장된 토큰 없음)이 보인다. localStorage에 `haruleaf.session`을 임의 값으로 넣고 새로고침 → 서버가 꺼져 있으므로 "서버에 연결할 수 없어요 · 다시 시도" 화면. `npm run dev:server`를 켜고 "다시 시도" → 토큰이 유효하지 않아 401 → 로그인 화면. 확인 후 서버·Expo 종료, 포트 4000·8081 비움.

- [ ] **Step 7: 커밋**

```bash
cd ~/HaruLeaf
git add apps/app
git commit -m "feat: 앱 인증 기반 — API 타임아웃, 인증 상태·재시도, 공용 폼 컴포넌트

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 로그인·회원가입·홈 인사·프로필 화면

**Files:**
- Modify (전체 교체): `apps/app/src/app/(auth)/login.tsx`, `(auth)/signup.tsx`, `(main)/index.tsx`, `(main)/profile.tsx`

**Interfaces:**
- Consumes: Task 7의 `useAuth`, `useCurrentUser`, API 함수, 컴포넌트; shared `loginSchema`, `signupSchema`, `updateNicknameSchema`, `deleteAccountSchema`, `firstIssueByField`, `PASSWORD_RULE_HELP`

- [ ] **Step 1: 로그인 화면** — `apps/app/src/app/(auth)/login.tsx`

```tsx
import { loginSchema } from '@haruleaf/shared';
import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { loginRequest } from '@/api/auth';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/FormMessage';
import { Screen } from '@/components/Screen';
import { ServerStatus } from '@/components/ServerStatus';
import { TextField } from '@/components/TextField';
import { colors, fontSize } from '@/theme/tokens';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;
    const parsed = loginSchema.safeParse({ loginId, password });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.');
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      await signIn(await loginRequest(parsed.data));
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : '로그인하지 못했어요.');
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        하루한잎
      </Text>
      <Text style={styles.subtitle}>오늘의 한 잎을 남기러 오셨군요.</Text>
      {message && <FormMessage tone="error" message={message} />}
      <TextField label="아이디" value={loginId} onChangeText={setLoginId} autoComplete="username" textContentType="username" returnKeyType="next" />
      <TextField
        label="비밀번호"
        value={password}
        onChangeText={setPassword}
        secure
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
      />
      <Button title="로그인" onPress={() => void submit()} loading={submitting} />
      <Link href="/signup" style={styles.link}>
        처음이신가요? 회원가입
      </Link>
      {__DEV__ && <ServerStatus />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: fontSize.body, color: colors.textMuted },
  link: { fontSize: fontSize.body, color: colors.primary, fontWeight: '600', textAlign: 'center' },
});
```

- [ ] **Step 2: 회원가입 화면** — `apps/app/src/app/(auth)/signup.tsx`

```tsx
import { firstIssueByField, PASSWORD_RULE_HELP, signupSchema } from '@haruleaf/shared';
import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { signupRequest } from '@/api/auth';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/FormMessage';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { colors, fontSize } from '@/theme/tokens';

type Field = 'loginId' | 'password' | 'nickname';

export default function SignupScreen() {
  const { signIn } = useAuth();
  const [values, setValues] = useState<Record<Field, string>>({ loginId: '', password: '', nickname: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const change = (field: Field) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  async function submit() {
    if (submitting) return;
    const parsed = signupSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(firstIssueByField(parsed.error));
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      await signIn(await signupRequest(parsed.data));
    } catch (error) {
      if (error instanceof ApiError && error.code === 'LOGIN_ID_TAKEN') {
        setErrors({ loginId: error.message });
      } else {
        setMessage(error instanceof ApiError ? error.message : '가입하지 못했어요.');
      }
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        회원가입
      </Text>
      <Text style={styles.subtitle}>아이디·비밀번호·닉네임만 있으면 시작할 수 있어요.</Text>
      {message && <FormMessage tone="error" message={message} />}
      <TextField
        label="아이디"
        value={values.loginId}
        onChangeText={change('loginId')}
        error={errors.loginId}
        help="영문 소문자·숫자·_ 3~20자"
        autoComplete="username"
        textContentType="username"
        returnKeyType="next"
      />
      <TextField
        label="비밀번호"
        value={values.password}
        onChangeText={change('password')}
        error={errors.password}
        help={PASSWORD_RULE_HELP}
        secure
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
      />
      <TextField
        label="닉네임"
        value={values.nickname}
        onChangeText={change('nickname')}
        error={errors.nickname}
        help="1~10자, 홈 인사말에 쓰여요"
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
      />
      <Button title="가입하기" onPress={() => void submit()} loading={submitting} />
      <Link href="/login" style={styles.link}>
        이미 계정이 있어요 · 로그인
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: fontSize.body, color: colors.textMuted },
  link: { fontSize: fontSize.body, color: colors.primary, fontWeight: '600', textAlign: 'center' },
});
```

- [ ] **Step 3: 홈 인사** — `apps/app/src/app/(main)/index.tsx`

```tsx
import { StyleSheet, Text } from 'react-native';
import { useCurrentUser } from '@/auth/AuthProvider';
import { Screen } from '@/components/Screen';
import { colors, fontSize } from '@/theme/tokens';

export default function HomeScreen() {
  const user = useCurrentUser();
  if (!user) return null;
  return (
    <Screen>
      <Text style={styles.greeting} accessibilityRole="header">
        {user.nickname}님 오늘도 한 잎을 남겨볼까요?
      </Text>
      <Text style={styles.note}>이번 달 식물과 성장률은 4단계에서 이곳에 표시됩니다.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  greeting: { fontSize: fontSize.title, fontWeight: '700', color: colors.text, lineHeight: 36 },
  note: { fontSize: fontSize.body, color: colors.textMuted },
});
```

- [ ] **Step 4: 프로필** — `apps/app/src/app/(main)/profile.tsx`

```tsx
import { deleteAccountSchema, updateNicknameSchema } from '@haruleaf/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { deleteAccountRequest, updateNicknameRequest } from '@/api/auth';
import { ApiError } from '@/api/client';
import { useAuth, useCurrentUser } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { ConfirmModal } from '@/components/ConfirmModal';
import { FormMessage } from '@/components/FormMessage';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

export default function ProfileScreen() {
  const user = useCurrentUser();
  const { setUser, signOut } = useAuth();
  const [nickname, setNickname] = useState(user?.nickname ?? '');
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function saveNickname() {
    if (saving) return;
    const parsed = updateNicknameSchema.safeParse({ nickname });
    if (!parsed.success) {
      setNicknameError(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.');
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const { user: updated } = await updateNicknameRequest(parsed.data);
      setUser(updated);
      setNickname(updated.nickname);
      setNotice({ tone: 'success', message: '닉네임을 바꿨어요.' });
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof ApiError ? error.message : '닉네임을 바꾸지 못했어요.' });
    } finally {
      setSaving(false);
    }
  }

  function closeWithdraw() {
    if (deleting) return;
    setWithdrawOpen(false);
    setPassword('');
    setWithdrawError(null);
  }

  async function withdraw() {
    if (deleting) return;
    const parsed = deleteAccountSchema.safeParse({ password });
    if (!parsed.success) {
      setWithdrawError(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.');
      return;
    }
    setDeleting(true);
    setWithdrawError(null);
    try {
      await deleteAccountRequest(parsed.data);
      setWithdrawOpen(false);
      await signOut();
    } catch (error) {
      setWithdrawError(error instanceof ApiError ? error.message : '탈퇴하지 못했어요.');
      setDeleting(false);
    }
  }

  if (!user) return null;

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        프로필
      </Text>
      {notice && <FormMessage tone={notice.tone} message={notice.message} />}

      <View style={styles.card}>
        <Text style={styles.label}>아이디</Text>
        <Text style={styles.value}>{user.loginId}</Text>
      </View>

      <View style={styles.card}>
        <TextField
          label="닉네임"
          value={nickname}
          onChangeText={(value) => {
            setNickname(value);
            setNicknameError(null);
          }}
          error={nicknameError}
          help="1~10자"
          returnKeyType="done"
          onSubmitEditing={() => void saveNickname()}
        />
        <Button title="닉네임 저장" onPress={() => void saveNickname()} loading={saving} disabled={nickname.trim() === user.nickname} />
      </View>

      <Button title="로그아웃" variant="secondary" onPress={() => void signOut()} />
      <Button title="회원탈퇴" variant="danger" onPress={() => setWithdrawOpen(true)} />

      <ConfirmModal
        visible={withdrawOpen}
        title="정말 탈퇴할까요?"
        description="일기·코인·식물·정원 기록이 모두 삭제되며 되돌릴 수 없어요. 계속하려면 비밀번호를 입력해주세요."
        confirmLabel="탈퇴하기"
        confirmVariant="danger"
        onConfirm={() => void withdraw()}
        onCancel={closeWithdraw}
        loading={deleting}>
        <TextField
          label="비밀번호"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setWithdrawError(null);
          }}
          error={withdrawError}
          secure
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="done"
          onSubmitEditing={() => void withdraw()}
        />
      </ConfirmModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  label: { fontSize: fontSize.caption, fontWeight: '600', color: colors.textMuted },
  value: { fontSize: fontSize.body, color: colors.text },
});
```

- [ ] **Step 5: 자동 검증**

Run: `cd ~/HaruLeaf && npm run db:up && npm test && npm run typecheck && npm run lint`
Expected: 모두 통과.

- [ ] **Step 6: Web 흐름 확인**

`npm run dev`(백그라운드, 로그 파일로) 후 브라우저(가능하면 브라우저 도구, 아니면 보고서에 수행 불가 명시)로 `http://localhost:8081`:
1. 회원가입: 비밀번호 `haru1234!` → 비밀번호 칸 아래 "비밀번호에 대문자·숫자·특수문자를 각각 1자 이상 넣어주세요." / "보기" 누르면 입력값이 보임.
2. `webtest_01` / `Haru123!` / `웹테스터`로 가입 → 홈에 "웹테스터님 오늘도 한 잎을 남겨볼까요?"
3. 새로고침 → 로그인 유지(홈 그대로).
4. 프로필 → 닉네임 `새잎`으로 저장 → "닉네임을 바꿨어요." → 홈 인사 "새잎님 …".
5. 로그아웃 → 로그인 화면. 틀린 비밀번호로 로그인 → "아이디 또는 비밀번호가 올바르지 않습니다.", 입력값 유지. 올바르게 로그인 → 홈.
6. 프로필 → 회원탈퇴 → 틀린 비밀번호 → 모달 안에 "비밀번호가 올바르지 않습니다."(로그아웃되지 않음) → 올바른 비밀번호 → 로그인 화면. 같은 계정 로그인 시도 → 실패 메시지.
7. 브라우저 콘솔 오류 0.
확인 후 dev를 SIGINT로 종료하고 포트 4000·8081 비움.

- [ ] **Step 7: 커밋**

```bash
cd ~/HaruLeaf
git add apps/app
git commit -m "feat: 로그인·회원가입·홈 인사·프로필(닉네임 수정·로그아웃·탈퇴) 화면

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## 설계 문서와의 차이 (의도된 결정)

- 앱 공용 컴포넌트는 별도 작업으로 나누지 않고 인증 기반(Task 7)에 포함했다. 각 컴포넌트만으로는 독립 검증 대상이 없기 때문.
- 서버 설정용 `logStream` 주입을 `AppDeps`에 추가했다(로그 민감정보 테스트용).
- 교차 기기(iOS 시뮬레이터 ↔ Web) 수동 확인과 `auth_events` 조회는 구현 완료 후 컨트롤러가 수행한다.
