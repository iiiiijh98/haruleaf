// 개발·시연 전용: 특정 계정에 코인을 넣는다. HTTP로는 노출하지 않는다.
// 사용법: npm run dev:grant-coins -- <아이디> <양>
import { loadConfig, loadRootEnv } from '../config';
import { createDb } from '../db/client';
import { grantCoins } from '../domain/coins';

loadRootEnv();
const [loginId, amountText] = process.argv.slice(2);
if (!loginId || !amountText) {
  console.error('사용법: npm run dev:grant-coins -- <아이디> <양>');
  process.exit(1);
}
const amount = Number(amountText);
const { db, pool } = createDb(loadConfig().databaseUrl);
try {
  const { coinBalance } = await grantCoins(db, loginId.trim().toLowerCase(), amount);
  console.log(`${loginId}에게 ${amount}코인을 넣었습니다. 현재 잔액: ${coinBalance}코인`);
} catch (error) {
  console.error(error instanceof Error ? error.message : '코인을 넣지 못했습니다.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
