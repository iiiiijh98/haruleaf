import type { z } from 'zod';
import { selectPlantSchema, type PlantKind, type PlantSummary } from './diary';

export type AttendanceResponse = { coinBalance: number; attendedToday: true; earned: number };

export type ShopItem = {
  id: string;
  name: string;
  description: string;
  kind: PlantKind;
  catalogClass: 'LIMITED' | 'SPECIAL';
  coinPrice: number;
  owned: boolean;
};
export type ShopResponse = { coinBalance: number; items: ShopItem[] };

export const purchaseSchema = selectPlantSchema;
export type PurchaseInput = z.infer<typeof purchaseSchema>;
export type PurchaseResponse = { coinBalance: number; plant: PlantSummary };
