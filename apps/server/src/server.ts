import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { loadConfig } from './config';
import { createDb } from './db/client';
import { systemClock } from './lib/clock';

// 루트 .env가 있으면 읽는다(이미 설정된 환경변수는 덮어쓰지 않음).
const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const config = loadConfig();
const { db, pool } = createDb(config.databaseUrl);
const app = await buildApp({
  db,
  clock: systemClock(config.timeZone),
  corsOrigins: config.corsOrigins,
  logger: true,
});

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

await app.listen({ host: config.host, port: config.port });
app.log.info({ corsOrigins: config.corsOrigins }, 'HaruLeaf API 서버가 시작되었습니다.');
