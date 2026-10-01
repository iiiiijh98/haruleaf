// 개발·시연 전용: 지난달 식물과 일기를 넣는다. HTTP로는 노출하지 않는다.
// 사용법: npm run dev:seed-month -- <아이디> <YYYY-MM> <식물ID> <일수>
import { loadConfig, loadRootEnv } from '../config';
import { createDb } from '../db/client';
import { seedMonth } from '../domain/seed-month';
import { systemClock } from '../lib/clock';

loadRootEnv();
const [loginId, month, plantId, daysText] = process.argv.slice(2);
if (!loginId || !month || !plantId || !daysText) {
  console.error('사용법: npm run dev:seed-month -- <아이디> <YYYY-MM> <식물ID> <일수>');
  process.exit(1);
}
const config = loadConfig();
const { db, pool } = createDb(config.databaseUrl);
try {
  const today = systemClock(config.timeZone).today();
  const result = await seedMonth(db, loginId.trim().toLowerCase(), month, plantId.trim(), Number(daysText), today);
  console.log(`${loginId}의 ${result.month}에 ${plantId}와 일기 ${result.writtenDays}일을 넣었습니다. 앱을 열면 그 달이 마감됩니다.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : '기록을 넣지 못했습니다.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
