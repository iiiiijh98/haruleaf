import { loginSchema, signupSchema, type OkResponse } from '@haruleaf/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '../db/client';
import { login, logout, signup } from '../domain/accounts';
import { clientMeta } from '../lib/request-meta';
import { authOf, type RequireAuth } from '../plugins/auth';

export const authRoutes: FastifyPluginAsync<{ db: Db; requireAuth: RequireAuth }> = async (app, { db, requireAuth }) => {
  app.post('/auth/signup', async (request, reply) => {
    const input = signupSchema.parse(request.body);
    const result = await signup(db, input, clientMeta(request));
    return reply.status(201).send(result);
  });

  app.post('/auth/login', async (request) => {
    const input = loginSchema.parse(request.body);
    return login(db, input, clientMeta(request));
  });

  app.post('/auth/logout', { preHandler: requireAuth }, async (request): Promise<OkResponse> => {
    await logout(db, authOf(request), clientMeta(request));
    return { ok: true };
  });
};
