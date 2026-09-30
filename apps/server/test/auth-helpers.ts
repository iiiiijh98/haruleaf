import type { FastifyInstance } from 'fastify';

export const IOS = { 'x-client-platform': 'ios' } as const;
export const WEB = { 'x-client-platform': 'web' } as const;
export const VALID_PASSWORD = 'Haru123!';

type PlatformHeaders = typeof IOS | typeof WEB;

export function bearer(token: string, headers: PlatformHeaders = IOS) {
  return { ...headers, authorization: `Bearer ${token}` };
}

export function signupViaApi(
  app: FastifyInstance,
  override: Partial<{ loginId: string; password: string; nickname: string }> = {},
  headers: PlatformHeaders = IOS,
) {
  return app.inject({
    method: 'POST',
    url: '/auth/signup',
    headers,
    payload: { loginId: 'haru_01', password: VALID_PASSWORD, nickname: '진화', ...override },
  });
}

export function loginViaApi(app: FastifyInstance, loginId: string, password: string, headers: PlatformHeaders = IOS) {
  return app.inject({ method: 'POST', url: '/auth/login', headers, payload: { loginId, password } });
}
