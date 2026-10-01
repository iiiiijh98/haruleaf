import { daysInMonth, monthKeySchema } from '@haruleaf/shared';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { diaries, monthlyRecords, userPlants, users } from '../db/schema';
import { lockMonth, monthStartOf } from './months';

export const SEED_DIARY_BODY = '시연용 일기입니다.';

/**
 * 개발·시연 전용: 지난달 식물과 1일~days일 일기를 넣는다. HTTP로는 노출하지 않는다.
 * 넣은 달은 다음 /home·/garden 요청 때 마감된다.
 */
export async function seedMonth(
  db: Db,
  loginId: string,
  month: string,
  plantId: string,
  days: number,
  today: string,
): Promise<{ month: string; writtenDays: number }> {
  const parsed = monthKeySchema.safeParse(month);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? '월 형식이 올바르지 않아요.');
  const monthStart = `${month}-01`;
  if (monthStart >= monthStartOf(today)) throw new Error(`지난 달만 넣을 수 있어요: ${month}`);
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const totalDays = daysInMonth(year, monthNumber);
  if (!Number.isInteger(days) || days < 0 || days > totalDays) {
    throw new Error(`일수는 0~${totalDays} 사이 정수로 넣어주세요.`);
  }

  return db.transaction(async (tx) => {
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.loginId, loginId)).limit(1);
    if (!user) throw new Error(`아이디를 찾을 수 없습니다: ${loginId}`);
    const [owned] = await tx
      .select({ plantId: userPlants.plantId })
      .from(userPlants)
      .where(and(eq(userPlants.userId, user.id), eq(userPlants.plantId, plantId)))
      .limit(1);
    if (!owned) throw new Error(`보유한 식물만 넣을 수 있어요: ${plantId}`);
    const record = await lockMonth(tx, user.id, monthStart);
    if (record.finalized) throw new Error(`이미 마감된 달이에요: ${month}`);
    await tx
      .update(monthlyRecords)
      .set({ plantId, selectionLocked: record.selectionLocked || days > 0 })
      .where(and(eq(monthlyRecords.userId, user.id), eq(monthlyRecords.month, monthStart)));
    if (days > 0) {
      const values = Array.from({ length: days }, (_, index) => ({
        userId: user.id,
        diaryDate: `${month}-${String(index + 1).padStart(2, '0')}`,
        body: SEED_DIARY_BODY,
      }));
      await tx.insert(diaries).values(values).onConflictDoNothing();
    }
    return { month, writtenDays: days };
  });
}
