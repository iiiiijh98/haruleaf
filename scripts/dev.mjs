import { spawn } from 'node:child_process';
import os from 'node:os';
import { pickLanAddress } from './lan-address.mjs';

const API_PORT = 4000;
const EXPO_PORT = 8081;

const host = pickLanAddress(os.networkInterfaces());
const apiUrl = `http://${host}:${API_PORT}`;
const corsOrigins = [...new Set([`http://localhost:${EXPO_PORT}`, `http://${host}:${EXPO_PORT}`])].join(',');

console.log('');
console.log(`  맥북 주소      : ${host}${host === 'localhost' ? ' (네트워크 없음 → 시뮬레이터·이 맥의 브라우저만 접속 가능)' : ''}`);
console.log(`  API 서버       : ${apiUrl}`);
console.log(`  Web            : http://${host}:${EXPO_PORT}`);
console.log(`  CORS 허용 출처 : ${corsOrigins}`);
console.log('');

const children = [
  // 서버는 키 입력을 받지 않으므로 stdin을 넘기지 않는다(Expo 단축키 i/w와 충돌 방지).
  spawn('npm', ['run', 'dev', '-w', '@haruleaf/server'], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, CORS_ORIGINS: corsOrigins, PORT: String(API_PORT) },
  }),
  spawn('npm', ['run', 'start', '-w', '@haruleaf/app', '--', '--port', String(EXPO_PORT)], {
    stdio: 'inherit',
    env: { ...process.env, EXPO_PUBLIC_API_URL: apiUrl },
  }),
];

let stopping = false;
function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGINT');
  }
  setTimeout(() => process.exit(code), 500);
}

for (const child of children) {
  child.on('exit', (code) => stopAll(code ?? 0));
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
