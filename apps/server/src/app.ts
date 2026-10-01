import cors from '@fastify/cors';
import { PLATFORM_HEADER, platformSchema, type Platform } from '@haruleaf/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { randomPick, type PickUnlock } from './domain/closing';
import type { Db } from './db/client';
import type { Clock } from './lib/clock';
import { AppError, registerErrorHandlers } from './lib/errors';
import { authRoutes, logoutRoutes } from './routes/auth';
import { healthRoutes } from './routes/health';
import { diaryRoutes } from './routes/diaries';
import { coinRoutes } from './routes/coins';
import { shopRoutes } from './routes/shop';
import { gardenRoutes } from './routes/garden';
import { homeRoutes } from './routes/home';
import { meRoutes } from './routes/me';
import { protectedRoutes } from './routes/protected';

declare module 'fastify' {
  interface FastifyRequest {
    platform: Platform;
  }
}

export type AppDeps = {
  db: Db;
  clock: Clock;
  corsOrigins: string[];
  attendanceCoins?: number;
  pickUnlock?: PickUnlock;
  logger?: boolean;
  logStream?: { write(message: string): void };
};

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const loggerOptions = { redact: ['req.headers.authorization', 'req.body.password', 'req.body.body'] };
  const app = Fastify({
    logger: deps.logStream
      ? { ...loggerOptions, stream: deps.logStream }
      : deps.logger
        ? loggerOptions
        : false,
  });

  await app.register(cors, {
    origin: deps.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Client-Platform'],
  });

  registerErrorHandlers(app);

  app.decorateRequest('platform', 'web');
  app.decorateRequest('auth', null);
  app.addHook('onRequest', async (request) => {
    if (request.method === 'OPTIONS') return;
    const parsed = platformSchema.safeParse(request.headers[PLATFORM_HEADER]);
    if (!parsed.success) {
      throw new AppError('INVALID_PLATFORM', '지원하지 않는 클라이언트입니다.', 400);
    }
    request.platform = parsed.data;
  });

  await app.register(healthRoutes, { db: deps.db, clock: deps.clock });

  await app.register(authRoutes, { db: deps.db });
  await app.register(protectedRoutes([logoutRoutes, meRoutes, homeRoutes, diaryRoutes, coinRoutes, shopRoutes, gardenRoutes]), {
    db: deps.db,
    clock: deps.clock,
    attendanceCoins: deps.attendanceCoins ?? 5,
    pickUnlock: deps.pickUnlock ?? randomPick,
  });

  return app;
}
