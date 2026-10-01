import { loginSchema, signupSchema, type OkResponse } from '@haruleaf/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '../db/client';
import { login, logout, signup } from '../domain/accounts';
import { clientMeta } from '../lib/request-meta';
import { authOf } from '../plugins/auth';
import type { ProtectedPlugin } from './protected';

export const authRoutes: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  app.post('/auth/signup', async (request, reply) => {
    const input = signupSchema.parse(request.body);
    const result = await signup(db, input, clientMeta(request));
    return reply.status(201).send(result);
  });

  app.post('/auth/login', async (request) => {
    const input = loginSchema.parse(request.body);
    return login(db, input, clientMeta(request));
  });
};

export const logoutRoutes: ProtectedPlugin = async (app, { db }) => {
  app.post('/auth/logout', async (request): Promise<OkResponse> => {
    await logout(db, authOf(request), clientMeta(request));
    return { ok: true };
  });
};
