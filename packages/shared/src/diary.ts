import { z } from 'zod';
import type { UnlockNotice } from './garden';
import type { GrowthStage } from './growth';
import { FORM_MESSAGE, hasNoNul, INVALID_CHARACTER_MESSAGE } from './text';

export const DIARY_BODY_MAX = 10_000;
export const DIARY_BODY_MESSAGE = '일기는 1~10,000자로 써주세요.';

export const diaryBodySchema = z
  .string({ error: DIARY_BODY_MESSAGE })
  .trim()
  .refine((value) => {
    const length = Array.from(value).length;
    return length >= 1 && length <= DIARY_BODY_MAX;
  }, DIARY_BODY_MESSAGE)
  .refine(hasNoNul, INVALID_CHARACTER_MESSAGE);

export const diaryInputSchema = z.object({ body: diaryBodySchema }, { error: FORM_MESSAGE });

const PLANT_MESSAGE = '식물을 골라주세요.';
export const selectPlantSchema = z.object(
  {
    plantId: z
      .string({ error: PLANT_MESSAGE })
      .min(1, PLANT_MESSAGE)
      .max(40, PLANT_MESSAGE)
      .refine(hasNoNul, INVALID_CHARACTER_MESSAGE),
  },
  { error: FORM_MESSAGE },
);

const MONTH_MESSAGE = '월 형식이 올바르지 않아요.';
export const monthKeySchema = z.string({ error: MONTH_MESSAGE }).regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/, MONTH_MESSAGE);

const DATE_MESSAGE = '날짜 형식이 올바르지 않아요.';
export const diaryDateSchema = z
  .string({ error: DATE_MESSAGE })
  .regex(/^[1-9]\d{3}-\d{2}-\d{2}$/, DATE_MESSAGE)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, DATE_MESSAGE);

export type DiaryInput = z.infer<typeof diaryInputSchema>;
export type SelectPlantInput = z.infer<typeof selectPlantSchema>;

export type PlantKind = 'PLANT' | 'FLOWER';
export type CatalogClass = 'STANDARD' | 'LIMITED' | 'SPECIAL';

export type PlantSummary = { id: string; name: string; kind: PlantKind; catalogClass: CatalogClass };
export type CatalogPlant = PlantSummary & { description: string; coinPrice: number | null; owned: boolean };
export type PlantsResponse = { plants: CatalogPlant[] };

export type MonthSnapshot = {
  /** YYYY-MM */
  month: string;
  plant: PlantSummary | null;
  selectionLocked: boolean;
  writtenDays: number;
  totalDays: number;
  /** 반올림 전 값 */
  growthPercent: number;
  growthStage: GrowthStage;
  fullyGrown: boolean;
};

export type HomeResponse = MonthSnapshot & {
  today: string;
  todayDiary: boolean;
  coinBalance: number;
  attendedToday: boolean;
  /** 마감으로 해금됐지만 아직 확인하지 않은 식물(월 오름차순) */
  newUnlocks: UnlockNotice[];
  /** 출석 1회 지급량 */
  attendanceCoins: number;
};

export type DiaryEntry = { date: string; body: string; createdAt: string; updatedAt: string };
export type DiaryListResponse = { month: string; today: string; editable: boolean; diaries: DiaryEntry[] };
export type DiaryResponse = { diary: DiaryEntry; editable: boolean };
export type DiaryMutationResponse = { diary: DiaryEntry };
