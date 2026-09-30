import { deleteAccountSchema, updateNicknameSchema, type MeResponse, type OkResponse } from '@haruleaf/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '../db/client';
import { deleteAccount, getUser, updateNickname } from '../domain/accounts';
import { authOf, type RequireAuth } from '../plugins/auth';

export const meRoutes: FastifyPluginAsync<{ db: Db; requireAuth: RequireAuth }> = async (app, { db, requireAuth }) => {
  app.get('/me', { preHandler: requireAuth }, async (request): Promise<MeResponse> => ({
    user: await getUser(db, authOf(request).userId),
  }));

  app.patch('/me', { preHandler: requireAuth }, async (request): Promise<MeResponse> => {
    const { nickname } = updateNicknameSchema.parse(request.body);
    return { user: await updateNickname(db, authOf(request).userId, nickname) };
  });

  app.delete('/me', { preHandler: requireAuth }, async (request): Promise<OkResponse> => {
    const { password } = deleteAccountSchema.parse(request.body);
    await deleteAccount(db, authOf(request).userId, password);
    return { ok: true };
  });
};
