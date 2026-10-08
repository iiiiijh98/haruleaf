# 하루한잎 (HaruLeaf)

일기를 쓴 날만큼 이달의 식물이 자라는 iOS · Web 앱.

- `apps/app` — Expo(SDK 57) + Expo Router 앱 (iOS · Web)
- `apps/server` — Fastify + Drizzle API 서버
- `packages/shared` — 앱·서버 공용 코드(성장률 계산, 스키마, 타입)

## 준비물

- Node.js 22.12 이상 (24 LTS 권장), npm
- Docker Desktop (PostgreSQL 실행용)
- Xcode + iOS 시뮬레이터 (iOS 확인 시)
- 실제 아이폰으로 볼 때: App Store의 **Expo Go**

## 처음 한 번

```bash
npm install
npm run db:up        # PostgreSQL 16 (localhost:5433) 실행, 데이터는 Docker 볼륨에 영구 보존
npm run db:migrate   # 테이블 생성
npm run db:seed      # 식물 카탈로그 입력
```

## 실행

```bash
npm run dev
```

- 맥북 Wi-Fi 주소를 자동으로 찾아 API 서버(4000)와 Expo(8081)를 함께 띄운다.
- 터미널에서 `i` → iOS 시뮬레이터, `w` → 브라우저.
- 실제 아이폰: 맥북과 **같은 Wi-Fi**에 연결하고 Expo Go로 터미널의 QR 코드를 찍는다.
- 다른 컴퓨터 브라우저: 터미널에 표시된 `Web` 주소로 접속한다.
- 모든 기기가 같은 서버·같은 DB를 쓰므로, 한 기기에서 가입한 계정으로 다른 기기에서 로그인해도 같은 기록이 보인다.
- 처음 실행할 때 macOS가 "들어오는 네트워크 연결 허용"을 물으면 허용한다.

### 아이폰이 서버에 연결되지 않을 때

- 학교·공용 Wi-Fi는 기기끼리 통신을 막는 경우가 많다. 맥북을 **아이폰 개인용 핫스팟**에 연결하고 `npm run dev`를 다시 실행한다.
- Wi-Fi를 바꿨다면 `npm run dev`를 다시 실행한다(주소가 바뀌므로).

## 확인 명령

```bash
npm test          # shared 단위 테스트 + server 통합 테스트(테스트 DB 사용) + 스크립트 테스트
npm run typecheck
npm run lint
```

## DB 관리

```bash
npm run db:down                                             # 컨테이너 중지(데이터 유지)
docker exec -it haruleaf-db psql -U haruleaf -d haruleaf    # DB 직접 조회
npm run db:generate -- --name <이름>                         # 스키마 변경 후 마이그레이션 생성
```

테스트 DB `haruleaf_test`는 Docker 볼륨을 처음 만들 때만 생성된다(`docker/initdb`는 한 번만 실행). 오래된 볼륨에서 없다면 `docker exec haruleaf-db psql -U haruleaf -d haruleaf -c "CREATE DATABASE haruleaf_test OWNER haruleaf"`로 만든다.

데이터를 완전히 지우려면 `docker compose down -v` (볼륨 삭제, 되돌릴 수 없음).

### 시연용 코인 넣기

출석은 하루 5코인이라 상점 구매(50·100코인)를 바로 보여주기 어렵다. 개발·시연 중에는 아래 명령으로 계정에 코인을 넣는다(원장에 `ADJUSTMENT`로 기록).

```bash
npm run dev:grant-coins -- <아이디> 100
```

### 시연용 지난달 기록

월 마감과 식물 해금은 달이 바뀌어야 보인다. 시연 중에는 아래 명령으로 지난달 식물과 일기(1일부터 n일까지)를 넣은 뒤 앱을 열면, 그 달이 마감되고 80% 이상이면 새 식물 해금 안내가 뜬다.

```bash
npm run dev:seed-month -- <아이디> 2026-09 rose 25
```

이번 달·미래 달, 이미 마감된 달, 보유하지 않은 식물은 거절한다.

## 운영 배포 (EC2, Docker)

API 서버와 PostgreSQL을 `docker-compose.prod.yml`로 함께 띄운다. 개발용 `docker-compose.yml`과는 프로젝트 이름·볼륨이 따로다.

```bash
git clone <저장소 주소> haruleaf && cd haruleaf
cp .env.prod.example .env && chmod 600 .env && vi .env   # 값 채우기(파일 안 설명 참고)
docker compose -f docker-compose.prod.yml up -d --build
curl -H 'x-client-platform: web' http://localhost:4000/health   # {"status":"ok","db":"ok",...}
```

- 컨테이너가 뜰 때마다 마이그레이션과 식물 카탈로그 반영을 자동으로 한다.
- DB는 호스트 포트를 열지 않는다. backend만 compose 내부망(`db:5432`)으로 접속한다.
- 업데이트: `git pull && docker compose -f docker-compose.prod.yml up -d --build`
- 로그: `docker compose -f docker-compose.prod.yml logs -f backend`
- 시연 명령(운영 DB에 바로 반영되니 주의):
  ```bash
  docker compose -f docker-compose.prod.yml exec backend /app/node_modules/.bin/tsx src/scripts/grant-coins.ts <아이디> 100
  docker compose -f docker-compose.prod.yml exec backend /app/node_modules/.bin/tsx src/scripts/seed-month.ts <아이디> 2026-09 rose 25
  ```
- 앱은 빌드할 때 `EXPO_PUBLIC_API_URL=http://<EC2 주소>:<HARULEAF_BACKEND_HOST_PORT>`로 이 서버를 가리키게 한다.
