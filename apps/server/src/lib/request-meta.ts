import type { Platform } from '@haruleaf/shared';
import type { FastifyRequest } from 'fastify';

export type ClientMeta = { platform: Platform; ip: string | null; userAgent: string | null };

const USER_AGENT_MAX = 300;

export function clientMeta(request: FastifyRequest): ClientMeta {
  const userAgent = request.headers['user-agent'];
  return {
    platform: request.platform,
    ip: request.ip || null,
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, USER_AGENT_MAX) : null,
  };
}
