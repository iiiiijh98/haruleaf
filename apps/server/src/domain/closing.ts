import { growthPercent, growthStage, isFullyGrown } from '@haruleaf/shared';
import { and, asc, count, eq, gte, isNull, lt } from 'drizzle-orm';
import type { Db } from '../db/client';
import { diaries, monthlyRecords, plants, userPlants } from '../db/schema';
import { monthStartOf, nextMonthStart } from './months';

/** 해금 후보 id 목록(sort_order·id 순)에서 하나를 고른다. */
export type PickUnlock = (candidateIds: string[]) => string;

export const randomPick: PickUnlock = (ids) => {
  const picked = ids[Math.floor(Math.random() * ids.length)];
  if (picked === undefined) throw new Error('해금 후보가 비어 있습니다.');
  return picked;
};

/**
 * 이번 달보다 이전이고 아직 마감하지 않은 달을 확정한다(SYS-11, 프로세스 3.1).
 * 한 트랜잭션에서 월 순서대로 FOR UPDATE로 잠그므로, 동시 요청은 같은 순서로 기다렸다가
 * 이미 마감된 행을 건너뛴다. 코인은 건드리지 않는다.
 */
export async function closePastMonths(db: Db, userId: string, today: string, pickUnlock: PickUnlock): Promise<void> {
  const currentStart = monthStartOf(today);
  const pendingFilter = and(
    eq(monthlyRecords.userId, userId),
    lt(monthlyRecords.month, currentStart),
    eq(monthlyRecords.finalized, false),
  );
  const [pending] = await db.select({ month: monthlyRecords.month }).from(monthlyRecords).where(pendingFilter).limit(1);
  if (!pending) return;

  await db.transaction(async (tx) => {
    const rows = await tx.select().from(monthlyRecords).where(pendingFilter).orderBy(asc(monthlyRecords.month)).for('update');
    for (const row of rows) {
      if (row.finalized) continue;
      const [written] = await tx
        .select({ value: count() })
        .from(diaries)
        .where(and(eq(diaries.userId, userId), gte(diaries.diaryDate, row.month), lt(diaries.diaryDate, nextMonthStart(row.month))));
      const writtenDays = written?.value ?? 0;
      const percent = growthPercent(writtenDays, row.totalDays);

      let unlockedPlantId: string | null = null;
      if (row.plantId && isFullyGrown(percent)) {
        const candidates = await tx
          .select({ id: plants.id })
          .from(plants)
          .leftJoin(userPlants, and(eq(userPlants.plantId, plants.id), eq(userPlants.userId, userId)))
          .where(and(eq(plants.catalogClass, 'STANDARD'), eq(plants.isActive, true), isNull(userPlants.userId)))
          .orderBy(asc(plants.sortOrder), asc(plants.id));
        const ids = candidates.map((candidate) => candidate.id);
        if (ids.length > 0) {
          const picked = pickUnlock(ids);
          if (!ids.includes(picked)) throw new Error(`해금 후보 밖의 식물입니다: ${picked}`);
          await tx.insert(userPlants).values({ userId, plantId: picked, unlockSource: 'ACHIEVEMENT' }).onConflictDoNothing();
          unlockedPlantId = picked;
        }
      }

      await tx
        .update(monthlyRecords)
        .set({
          writtenDays,
          growthPercent: percent.toFixed(2),
          growthStage: growthStage(percent),
          finalized: true,
          finalizedAt: new Date(),
          unlockedPlantId,
        })
        .where(and(eq(monthlyRecords.userId, userId), eq(monthlyRecords.month, row.month)));
    }
  });
}
