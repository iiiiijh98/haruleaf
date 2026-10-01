import type { FastifyPluginAsync } from 'fastify';
import type { PickUnlock } from '../domain/closing';
import type { Db } from '../db/client';
import type { Clock } from '../lib/clock';
import { createRequireAuth } from '../plugins/auth';

export type ProtectedDeps = { db: Db; clock: Clock; attendanceCoins: number; pickUnlock: PickUnlock };
export type ProtectedPlugin = FastifyPluginAsync<ProtectedDeps>;

/** 이 플러그인 안에 등록한 라우트는 본문을 읽기 전에(onRequest) 로그인을 확인한다. */
export function protectedRoutes(plugins: ProtectedPlugin[]): FastifyPluginAsync<ProtectedDeps> {
  return async (app, deps) => {
    app.addHook('onRequest', createRequireAuth(deps.db));
    for (const plugin of plugins) {
      await app.register(plugin, deps);
    }
  };
}
