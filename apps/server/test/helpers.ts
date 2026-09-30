import { sql } from 'drizzle-orm';
import { loadRootEnv } from '../src/config';
import { createDb, type Db } from '../src/db/client';

// global-setup과 테스트 파일 모두 이 모듈을 거치므로 같은 URL을 본다.
loadRootEnv();

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://haruleaf:haruleaf@localhost:5433/haruleaf_test';

/** 실수로 개발 DB를 비우지 않도록 테스트 DB(이름이 _test로 끝남)만 허용한다. */
function assertTestDatabase(url: string): void {
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error(
      `테스트는 이름이 _test로 끝나는 데이터베이스에서만 실행할 수 있습니다. TEST_DATABASE_URL을 확인하세요: ${url.replace(/\/\/[^@]*@/, '//***@')}`,
    );
  }
}

export function createTestDb() {
  assertTestDatabase(TEST_DATABASE_URL);
  return createDb(TEST_DATABASE_URL);
}

/** 모든 테이블을 비운다(시드 포함). */
export async function resetDatabase(db: Db): Promise<void> {
  assertTestDatabase(TEST_DATABASE_URL);
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
