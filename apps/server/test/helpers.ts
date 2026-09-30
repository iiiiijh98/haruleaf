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
