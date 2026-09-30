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
