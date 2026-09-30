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
