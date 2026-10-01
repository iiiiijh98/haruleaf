import {
  daysInMonth,
  monthKeyOf,
  type GardenMonth,
  type GardenMonthResponse,
  type GardenResponse,
  type PlantSummary,
} from '@haruleaf/shared';
import { and, eq, gte, lte, min } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '../db/client';
import { monthlyRecords, plants } from '../db/schema';
import { AppError } from '../lib/errors';
import { monthSnapshot } from './months';

const invalidYear = () => new AppError('INVALID_YEAR', '볼 수 없는 연도예요.', 400);
const unlocked = alias(plants, 'unlocked_plants');

async function yearRange(db: Db, userId: string, today: string): Promise<{ minYear: number; maxYear: number }> {
  const maxYear = Number(today.slice(0, 4));
  const [row] = await db.select({ earliest: min(monthlyRecords.month) }).from(monthlyRecords).where(eq(monthlyRecords.userId, userId));
  const earliestYear = row?.earliest ? Number(row.earliest.slice(0, 4)) : maxYear;
  return { minYear: Math.min(earliestYear, maxYear), maxYear };
}

function emptyMonth(month: string): GardenMonth {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  return {
    month,
    status: 'EMPTY',
    plant: null,
    writtenDays: 0,
    totalDays: daysInMonth(year, monthNumber),
    growthPercent: 0,
    growthStage: 1,
    fullyGrown: false,
    unlockedPlant: null,
  };
}

/** 주어진 연속 월 목록(YYYY-MM, 오름차순)의 카드. 마감은 호출 전에 끝나 있어야 한다. */
async function monthsBetween(db: Db, userId: string, months: string[], today: string): Promise<GardenMonth[]> {
  const first = `${months[0]}-01`;
  const last = `${months[months.length - 1]}-01`;
  const rows = await db
    .select({
      month: monthlyRecords.month,
      unlockedId: unlocked.id,
      unlockedName: unlocked.name,
      unlockedKind: unlocked.kind,
      unlockedClass: unlocked.catalogClass,
    })
    .from(monthlyRecords)
    .leftJoin(unlocked, eq(unlocked.id, monthlyRecords.unlockedPlantId))
    .where(and(eq(monthlyRecords.userId, userId), gte(monthlyRecords.month, first), lte(monthlyRecords.month, last)));
  const byMonth = new Map(rows.map((row) => [monthKeyOf(row.month), row]));
  const current = monthKeyOf(today);

  const cards: GardenMonth[] = [];
  for (const month of months) {
    const row = byMonth.get(month);
    if (month > current || (!row && month !== current)) {
      cards.push(emptyMonth(month));
      continue;
    }
    const snapshot = await monthSnapshot(db, userId, `${month}-01`);
    const unlockedPlant: PlantSummary | null =
      row?.unlockedId && row.unlockedName && row.unlockedKind && row.unlockedClass
        ? {
            id: row.unlockedId,
            name: row.unlockedName,
            kind: row.unlockedKind as PlantSummary['kind'],
            catalogClass: row.unlockedClass as PlantSummary['catalogClass'],
          }
        : null;
    cards.push({
      month,
      status: month === current ? 'CURRENT' : snapshot.plant ? 'FINALIZED' : 'NO_PLANT',
      plant: snapshot.plant,
      writtenDays: snapshot.writtenDays,
      totalDays: snapshot.totalDays,
      growthPercent: snapshot.growthPercent,
      growthStage: snapshot.growthStage,
      fullyGrown: snapshot.fullyGrown,
      unlockedPlant,
    });
  }
  return cards;
}

export async function getGarden(db: Db, userId: string, year: number, today: string): Promise<GardenResponse> {
  const { minYear, maxYear } = await yearRange(db, userId, today);
  if (year < minYear || year > maxYear) throw invalidYear();
  const months = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
  return { year, minYear, maxYear, months: await monthsBetween(db, userId, months, today) };
}

export async function getGardenMonth(db: Db, userId: string, month: string, today: string): Promise<GardenMonthResponse> {
  const { minYear, maxYear } = await yearRange(db, userId, today);
  const year = Number(month.slice(0, 4));
  if (year < minYear || year > maxYear) throw invalidYear();
  const [card] = await monthsBetween(db, userId, [month], today);
  return { month: card! };
}
