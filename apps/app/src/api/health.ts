import type { HealthResponse } from '@haruleaf/shared';
import { apiRequest } from './client';

export function getHealth(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>('/health');
}
