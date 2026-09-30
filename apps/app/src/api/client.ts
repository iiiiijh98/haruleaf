import { PLATFORM_HEADER, type ApiErrorBody } from '@haruleaf/shared';
import { Platform } from 'react-native';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

const REQUEST_TIMEOUT_MS = 10_000;

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

export function getAuthToken(): string | null {
  return authToken;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** 생략하면 현재 세션 토큰을 쓴다. 명시하면 그 토큰(null이면 토큰 없이)으로 요청한다. */
  token?: string | null;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const usesSessionToken = options.token === undefined;
  const token = usesSessionToken ? authToken : options.token;
  const headers: Record<string, string> = {
    [PLATFORM_HEADER]: Platform.OS === 'web' ? 'web' : 'ios',
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new ApiError('TIMEOUT', '서버 응답이 늦어요. 잠시 후 다시 시도해주세요.', 0);
    }
    throw new ApiError('NETWORK_ERROR', '서버에 연결할 수 없어요. 네트워크와 서버 상태를 확인해주세요.', 0);
  } finally {
    clearTimeout(timer);
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (data as ApiErrorBody | null)?.error;
    const code = error?.code ?? 'UNKNOWN';
    // 요청에 쓴 토큰이 아직 현재 세션 토큰일 때만 로그아웃한다.
    // 이전 세션의 늦은 401이 재로그인한 새 세션을 서버에서 폐기하는 것을 막는다.
    if (response.status === 401 && usesSessionToken && token && token === authToken && code === 'UNAUTHORIZED') {
      unauthorizedHandler?.();
    }
    throw new ApiError(code, error?.message ?? '요청을 처리하지 못했어요.', response.status);
  }
  return data as T;
}
