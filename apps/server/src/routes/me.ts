import { deleteAccountSchema, updateNicknameSchema, type MeResponse, type OkResponse } from '@haruleaf/shared';
import { deleteAccount, getUser, updateNickname } from '../domain/accounts';
import { authOf } from '../plugins/auth';
import type { ProtectedPlugin } from './protected';

export const meRoutes: ProtectedPlugin = async (app, { db }) => {
  app.get('/me', async (request): Promise<MeResponse> => ({
    user: await getUser(db, authOf(request).userId),
  }));

  app.patch('/me', async (request): Promise<MeResponse> => {
    const { nickname } = updateNicknameSchema.parse(request.body);
    return { user: await updateNickname(db, authOf(request).userId, nickname) };
  });

  app.delete('/me', async (request): Promise<OkResponse> => {
    const { password } = deleteAccountSchema.parse(request.body);
    await deleteAccount(db, authOf(request).userId, password);
    return { ok: true };
  });
};
