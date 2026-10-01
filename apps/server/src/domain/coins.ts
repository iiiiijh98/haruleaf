import type { AttendanceResponse } from '@haruleaf/shared';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { coinTransactions, users } from '../db/schema';
import { isUniqueViolation } from '../lib/db-errors';
import { AppError } from '../lib/errors';

const MAX_GRANT = 100_000;

/** 서버 기준 오늘 출석. 원장 기록과 잔액 증가를 한 트랜잭션에서 처리한다. */
export async function attend(db: Db, userId: string, today: string, coins: number): Promise<AttendanceResponse> {
  try {
    return await db.transaction(async (tx) => {
      await tx.insert(coinTransactions).values({ userId, type: 'ATTENDANCE', amount: coins, referenceKey: today });
      const [row] = await tx
        .update(users)
        .set({ coinBalance: sql`${users.coinBalance} + ${coins}` })
        .where(eq(users.id, userId))
        .returning({ coinBalance: users.coinBalance });
      if (!row) throw new Error('사용자를 찾을 수 없습니다.');
      return { coinBalance: row.coinBalance, attendedToday: true, earned: coins };
    });
  } catch (error) {
    if (isUniqueViolation(error, 'coin_transactions_once_per_reference')) {
      throw new AppError('ALREADY_ATTENDED', '오늘은 이미 출석했어요.', 409);
    }
    throw error;
  }
}

/** 개발·시연용 코인 지급(CLI 전용). */
export async function grantCoins(db: Db, loginId: string, amount: number): Promise<{ coinBalance: number }> {
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_GRANT) {
    throw new Error('지급할 코인은 1~100,000 사이의 정수여야 합니다.');
  }
  return db.transaction(async (tx) => {
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.loginId, loginId)).limit(1);
    if (!user) throw new Error(`아이디를 찾을 수 없습니다: ${loginId}`);
    await tx.insert(coinTransactions).values({
      userId: user.id,
      type: 'ADJUSTMENT',
      amount,
      referenceKey: `adj:${randomUUID().replaceAll('-', '')}`,
    });
    const [row] = await tx
      .update(users)
      .set({ coinBalance: sql`${users.coinBalance} + ${amount}` })
      .where(eq(users.id, user.id))
      .returning({ coinBalance: users.coinBalance });
    return { coinBalance: row!.coinBalance };
  });
}
