#!/bin/sh
# 컨테이너가 뜰 때마다: 마이그레이션 적용 → 식물 카탈로그 반영(여러 번 실행해도 같음) → 서버 실행
set -e
TSX=/app/node_modules/.bin/tsx
"$TSX" src/db/migrate.ts
"$TSX" src/db/seed.ts
exec "$TSX" src/server.ts
