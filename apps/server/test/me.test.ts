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
