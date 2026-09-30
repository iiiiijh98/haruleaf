import { PLATFORM_HEADER, type ApiErrorBody } from '@haruleaf/shared';
import { Platform } from 'react-native';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    [PLATFORM_HEADER]: Platform.OS === 'web' ? 'web' : 'ios',
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', '서버에 연결할 수 없어요. 네트워크와 서버 상태를 확인해주세요.', 0);
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (data as ApiErrorBody | null)?.error;
    if (response.status === 401 && authToken) unauthorizedHandler?.();
    throw new ApiError(error?.code ?? 'UNKNOWN', error?.message ?? '요청을 처리하지 못했어요.', response.status);
  }
  return data as T;
}
