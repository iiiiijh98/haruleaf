import type {
  DiaryInput,
  DiaryListResponse,
  DiaryMutationResponse,
  DiaryResponse,
  HomeResponse,
  OkResponse,
  PlantsResponse,
  SelectPlantInput,
} from '@haruleaf/shared';
import { apiRequest } from './client';

export const fetchHome = () => apiRequest<HomeResponse>('/home');

export const fetchPlants = () => apiRequest<PlantsResponse>('/plants');

export const selectPlantRequest = (input: SelectPlantInput) =>
  apiRequest<HomeResponse>('/months/current/plant', { method: 'PUT', body: input });

export const fetchDiaries = (month?: string) =>
  apiRequest<DiaryListResponse>(month ? `/diaries?month=${encodeURIComponent(month)}` : '/diaries');

export const fetchDiary = (date: string) => apiRequest<DiaryResponse>(`/diaries/${encodeURIComponent(date)}`);

export const createDiaryRequest = (input: DiaryInput) =>
  apiRequest<DiaryMutationResponse>('/diaries', { method: 'POST', body: input });

export const updateDiaryRequest = (date: string, input: DiaryInput) =>
  apiRequest<DiaryMutationResponse>(`/diaries/${encodeURIComponent(date)}`, { method: 'PUT', body: input });

export const deleteDiaryRequest = (date: string) =>
  apiRequest<OkResponse>(`/diaries/${encodeURIComponent(date)}`, { method: 'DELETE' });
