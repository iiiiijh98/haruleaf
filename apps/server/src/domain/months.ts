import {
  daysInMonth,
  growthPercent,
  growthStage,
  isFullyGrown,
  monthKeyOf,
  type GrowthStage,
  type HomeResponse,
  type MonthSnapshot,
  type PlantsResponse,
  type PlantSummary,
} from '@haruleaf/shared';
import { and, asc, count, eq, gte, lt } from 'drizzle-orm';
import type { Db, Executor, Tx } from '../db/client';
import { coinTransactions, diaries, monthlyRecords, plants, userPlants, users } from '../db/schema';
import type { Clock } from '../lib/clock';
import { AppError } from '../lib/errors';

export type { Executor, Tx } from '../db/client';

/** 'YYYY-MM-DD' → 그 달 1일 'YYYY-MM-01' */
export function monthStartOf(date: string): string {
  return `${monthKeyOf(date)}-01`;
}

export function nextMonthStart(monthStart: string): string {
  const [year, month] = monthStart.split('-').map(Number) as [number, number];
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

function totalDaysOf(monthStart: string): number {
  const [year, month] = monthStart.split('-').map(Number) as [number, number];
  return daysInMonth(year, month);
}

export async function ensureMonth(executor: Executor, userId: string, monthStart: string): Promise<void> {
  await executor
    .insert(monthlyRecords)
    .values({ userId, month: monthStart, totalDays: totalDaysOf(monthStart) })
    .onConflictDoNothing();
}

/** 이번 달 행을 만들고 FOR UPDATE로 잠근다(같은 사용자의 동시 선택·작성 직렬화). */
export async function lockMonth(tx: Tx, userId: string, monthStart: string) {
  await ensureMonth(tx, userId, monthStart);
  const [row] = await tx
    .select()
    .from(monthlyRecords)
    .where(and(eq(monthlyRecords.userId, userId), eq(monthlyRecords.month, monthStart)))
    .for('update');
  if (!row) throw new Error('이번 달 기록을 만들지 못했습니다.');
  return row;
}

export async function monthSnapshot(db: Executor, userId: string, monthStart: string): Promise<MonthSnapshot> {
  const [record] = await db
    .select({
      totalDays: monthlyRecords.totalDays,
      selectionLocked: monthlyRecords.selectionLocked,
      plantId: plants.id,
      plantName: plants.name,
      plantKind: plants.kind,
      plantClass: plants.catalogClass,
      finalized: monthlyRecords.finalized,
      storedWrittenDays: monthlyRecords.writtenDays,
      storedPercent: monthlyRecords.growthPercent,
      storedStage: monthlyRecords.growthStage,
    })
    .from(monthlyRecords)
    .leftJoin(plants, eq(plants.id, monthlyRecords.plantId))
    .where(and(eq(monthlyRecords.userId, userId), eq(monthlyRecords.month, monthStart)))
    .limit(1);
  const [written] = await db
    .select({ value: count() })
    .from(diaries)
    .where(and(eq(diaries.userId, userId), gte(diaries.diaryDate, monthStart), lt(diaries.diaryDate, nextMonthStart(monthStart))));
  const totalDays = record?.totalDays ?? totalDaysOf(monthStart);
  // 마감된 달은 마감 때 저장한 확정값을 쓴다.
  const writtenDays = record?.finalized ? record.storedWrittenDays : (written?.value ?? 0);
  const percent = record?.finalized ? Number(record.storedPercent) : growthPercent(writtenDays, totalDays);
  const stage = record?.finalized ? (record.storedStage as GrowthStage) : growthStage(percent);
  const plant: PlantSummary | null =
    record?.plantId && record.plantName && record.plantKind && record.plantClass
      ? {
          id: record.plantId,
          name: record.plantName,
          kind: record.plantKind as PlantSummary['kind'],
          catalogClass: record.plantClass as PlantSummary['catalogClass'],
        }
      : null;
  return {
    month: monthKeyOf(monthStart),
    plant,
    selectionLocked: record?.selectionLocked ?? false,
    writtenDays,
    totalDays,
    growthPercent: percent,
    growthStage: stage,
    fullyGrown: isFullyGrown(percent),
  };
}

export async function homeFor(db: Db, userId: string, today: string): Promise<HomeResponse> {
  const monthStart = monthStartOf(today);
  await ensureMonth(db, userId, monthStart);
  const snapshot = await monthSnapshot(db, userId, monthStart);
  const [todayRow] = await db
    .select({ date: diaries.diaryDate })
    .from(diaries)
    .where(and(eq(diaries.userId, userId), eq(diaries.diaryDate, today)))
    .limit(1);
  const [account] = await db.select({ coinBalance: users.coinBalance }).from(users).where(eq(users.id, userId)).limit(1);
  const [attendance] = await db
    .select({ id: coinTransactions.id })
    .from(coinTransactions)
    .where(and(eq(coinTransactions.userId, userId), eq(coinTransactions.type, 'ATTENDANCE'), eq(coinTransactions.referenceKey, today)))
    .limit(1);
  return {
    ...snapshot,
    today,
    todayDiary: Boolean(todayRow),
    coinBalance: account?.coinBalance ?? 0,
    attendedToday: Boolean(attendance),
  };
}

export async function listPlants(db: Db, userId: string): Promise<PlantsResponse> {
  const rows = await db
    .select({
      id: plants.id,
      name: plants.name,
      description: plants.description,
      kind: plants.kind,
      catalogClass: plants.catalogClass,
      coinPrice: plants.coinPrice,
      ownerId: userPlants.userId,
    })
    .from(plants)
    .leftJoin(userPlants, and(eq(userPlants.plantId, plants.id), eq(userPlants.userId, userId)))
    .where(eq(plants.isActive, true))
    .orderBy(asc(plants.sortOrder), asc(plants.id));
  return {
    plants: rows.map(({ ownerId, ...plant }) => ({
      ...plant,
      kind: plant.kind as PlantSummary['kind'],
      catalogClass: plant.catalogClass as PlantSummary['catalogClass'],
      owned: ownerId !== null,
    })),
  };
}

export async function selectPlant(db: Db, userId: string, plantId: string, clock: Clock): Promise<HomeResponse> {
  const today = clock.today();
  const monthStart = monthStartOf(today);
  await db.transaction(async (tx) => {
    const [plant] = await tx
      .select({ id: plants.id })
      .from(plants)
      .where(and(eq(plants.id, plantId), eq(plants.isActive, true)))
      .limit(1);
    if (!plant) throw new AppError('PLANT_NOT_FOUND', '식물을 찾을 수 없어요.', 404);
    const [owned] = await tx
      .select({ plantId: userPlants.plantId })
      .from(userPlants)
      .where(and(eq(userPlants.userId, userId), eq(userPlants.plantId, plantId)))
      .limit(1);
    if (!owned) throw new AppError('PLANT_NOT_OWNED', '보유한 식물만 고를 수 있어요.', 403);
    const record = await lockMonth(tx, userId, monthStart);
    if (record.selectionLocked) throw new AppError('SELECTION_LOCKED', '첫 일기를 쓴 달은 식물을 바꿀 수 없어요.', 409);
    await tx
      .update(monthlyRecords)
      .set({ plantId })
      .where(and(eq(monthlyRecords.userId, userId), eq(monthlyRecords.month, monthStart)));
  });
  return homeFor(db, userId, today);
}
