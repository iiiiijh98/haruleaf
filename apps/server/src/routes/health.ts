import type { HealthResponse } from '@haruleaf/shared';
import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '../db/client';
import type { Clock } from '../lib/clock';
import { AppError } from '../lib/errors';

export const healthRoutes: FastifyPluginAsync<{ db: Db; clock: Clock }> = async (app, { db, clock }) => {
  app.get('/health', async (): Promise<HealthResponse> => {
    try {
      await db.execute(sql`select 1`);
    } catch {
      throw new AppError('DB_UNAVAILABLE', '데이터베이스에 연결할 수 없어요.', 503);
    }
    return { status: 'ok', db: 'ok', today: clock.today() };
  });
};
