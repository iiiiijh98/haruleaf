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
