import { z } from 'zod';
import { monthKeySchema, type CatalogClass, type PlantSummary } from './diary';
import type { GrowthStage } from './growth';
import { FORM_MESSAGE } from './text';

/** 마감으로 해금됐지만 아직 확인하지 않은 식물 */
export type UnlockNotice = { month: string; plant: PlantSummary };

export type GardenMonthStatus = 'FINALIZED' | 'CURRENT' | 'NO_PLANT' | 'EMPTY';

export type GardenMonth = {
  /** YYYY-MM */
  month: string;
  status: GardenMonthStatus;
  plant: PlantSummary | null;
  writtenDays: number;
  totalDays: number;
  growthPercent: number;
  growthStage: GrowthStage;
  fullyGrown: boolean;
  unlockedPlant: PlantSummary | null;
};

export type GardenResponse = { year: number; minYear: number; maxYear: number; months: GardenMonth[] };
export type GardenMonthResponse = { month: GardenMonth };

const ACK_MESSAGE = '확인할 달을 골라주세요.';
export const unlockAckSchema = z.object(
  { months: z.array(monthKeySchema, { error: ACK_MESSAGE }).min(1, ACK_MESSAGE).max(24, ACK_MESSAGE) },
  { error: FORM_MESSAGE },
);
export type UnlockAckInput = z.infer<typeof unlockAckSchema>;

const CLASS_LABEL: Record<CatalogClass, string> = { STANDARD: '기본', LIMITED: '한정', SPECIAL: '스페셜' };
export function catalogClassLabel(cls: CatalogClass): string {
  return CLASS_LABEL[cls];
}
