import type { FastifyRequest } from 'fastify';
import type { Db } from '../db/client';
import { authenticate, type AuthContext } from '../domain/accounts';
import { unauthorized } from '../lib/errors';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

/** Authorization: Bearer <token>이 유효한 세션이면 request.auth를 채운다. */
export function createRequireAuth(db: Db) {
  return async function requireAuth(request: FastifyRequest): Promise<void> {
    const header = request.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    const auth = token ? await authenticate(db, token) : null;
    if (!auth) throw unauthorized();
    request.auth = auth;
  };
}

export function authOf(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthorized();
  return request.auth;
}
