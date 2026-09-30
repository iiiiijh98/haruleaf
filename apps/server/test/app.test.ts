import { platformSchema } from '@haruleaf/shared';
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
  app.get('/__test/shared-zod', async () => platformSchema.parse('android'));
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

  it('공유 패키지의 zod 스키마가 던진 오류도 400 VALIDATION_ERROR', async () => {
    const response = await app.inject({ method: 'GET', url: '/__test/shared-zod', headers: IOS });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
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
