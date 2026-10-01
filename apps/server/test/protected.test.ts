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
  app = await buildApp({ db, clock: fixedClock('2026-10-15'), corsOrigins: ['http://localhost:8081'] });
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
  it.each([
    ['GET', '/me'],
    ['PATCH', '/me'],
    ['DELETE', '/me'],
    ['POST', '/auth/logout'],
    ['GET', '/home'],
    ['POST', '/unlocks/ack'],
    ['POST', '/attendance'],
    ['GET', '/shop'],
    ['POST', '/shop/purchase'],
    ['GET', '/garden'],
    ['GET', '/garden/2026-09'],
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
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:8081');
  });

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
