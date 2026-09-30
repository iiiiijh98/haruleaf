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
