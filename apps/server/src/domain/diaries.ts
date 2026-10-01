import { monthKeyOf, type DiaryEntry, type DiaryListResponse, type DiaryResponse } from '@haruleaf/shared';
import { and, desc, eq, gte, lt } from 'drizzle-orm';
import type { Db } from '../db/client';
import { diaries, monthlyRecords } from '../db/schema';
import type { Clock } from '../lib/clock';
import { isUniqueViolation } from '../lib/db-errors';
import { AppError, monthClosed } from '../lib/errors';
import { lockMonth, monthStartOf, nextMonthStart } from './months';

function toEntry(row: typeof diaries.$inferSelect): DiaryEntry {
  return {
    date: row.diaryDate,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const notFound = () => new AppError('DIARY_NOT_FOUND', '일기를 찾을 수 없어요.', 404);

function isCurrentMonth(date: string, clock: Clock): boolean {
  return monthKeyOf(date) === monthKeyOf(clock.today());
}

function assertEditable(date: string, clock: Clock): void {
  if (!isCurrentMonth(date, clock)) throw monthClosed();
}

export async function createDiary(db: Db, userId: string, body: string, clock: Clock): Promise<DiaryEntry> {
  const today = clock.today();
  const monthStart = monthStartOf(today);
  try {
    return await db.transaction(async (tx) => {
      const record = await lockMonth(tx, userId, monthStart);
      if (record.finalized) throw monthClosed();
      if (!record.plantId) throw new AppError('PLANT_NOT_SELECTED', '이번 달 식물을 먼저 골라주세요.', 409);
      const [row] = await tx.insert(diaries).values({ userId, diaryDate: today, body }).returning();
      if (!row) throw new Error('일기 저장 결과가 비어 있습니다.');
      if (!record.selectionLocked) {
        await tx
          .update(monthlyRecords)
          .set({ selectionLocked: true })
          .where(and(eq(monthlyRecords.userId, userId), eq(monthlyRecords.month, monthStart)));
      }
      return toEntry(row);
    });
  } catch (error) {
    if (isUniqueViolation(error, 'diaries_user_date_unique')) {
      throw new AppError('DIARY_EXISTS', '오늘 일기는 이미 있어요. 수정해주세요.', 409);
    }
    throw error;
  }
}

export async function listDiaries(db: Db, userId: string, month: string, clock: Clock): Promise<DiaryListResponse> {
  const monthStart = `${month}-01`;
  const rows = await db
    .select()
    .from(diaries)
    .where(and(eq(diaries.userId, userId), gte(diaries.diaryDate, monthStart), lt(diaries.diaryDate, nextMonthStart(monthStart))))
    .orderBy(desc(diaries.diaryDate));
  const today = clock.today();
  return { month, today, editable: month === monthKeyOf(today), diaries: rows.map(toEntry) };
}

export async function getDiary(db: Db, userId: string, date: string, clock: Clock): Promise<DiaryResponse> {
  const [row] = await db
    .select()
    .from(diaries)
    .where(and(eq(diaries.userId, userId), eq(diaries.diaryDate, date)))
    .limit(1);
  if (!row) throw notFound();
  return { diary: toEntry(row), editable: isCurrentMonth(date, clock) };
}

export async function updateDiary(
  db: Db,
  userId: string,
  date: string,
  body: string,
  clock: Clock,
  now = new Date(),
): Promise<DiaryEntry> {
  assertEditable(date, clock);
  const [row] = await db
    .update(diaries)
    .set({ body, updatedAt: now })
    .where(and(eq(diaries.userId, userId), eq(diaries.diaryDate, date)))
    .returning();
  if (!row) throw notFound();
  return toEntry(row);
}

export async function deleteDiary(db: Db, userId: string, date: string, clock: Clock): Promise<void> {
  assertEditable(date, clock);
  const deleted = await db
    .delete(diaries)
    .where(and(eq(diaries.userId, userId), eq(diaries.diaryDate, date)))
    .returning({ id: diaries.id });
  if (deleted.length === 0) throw notFound();
}
