import type { GardenMonthResponse, GardenResponse, OkResponse, UnlockAckInput } from '@haruleaf/shared';
import { apiRequest } from './client';

export const fetchGarden = (year?: number) => apiRequest<GardenResponse>(year === undefined ? '/garden' : `/garden?year=${year}`);

export const fetchGardenMonth = (month: string) => apiRequest<GardenMonthResponse>(`/garden/${encodeURIComponent(month)}`);

export const ackUnlocksRequest = (input: UnlockAckInput) => apiRequest<OkResponse>('/unlocks/ack', { method: 'POST', body: input });
