# HaruLeaf 기반(Foundation) 설계

- 작성일: 2026-09-30
- 기준 문서: `HaruLeaf_요구사항_명세서_v3.2_React.docx` (이하 "명세서")
- 범위: 전체 6단계 중 **2단계 — 기반** (모노레포 · DB 스키마 · API 서버 뼈대 · 앱 뼈대 · 개발 스크립트 · 테스트 환경)

## 0. 명세서 대비 확정된 변경 사항

| 항목 | 명세서 | 확정 |
|---|---|---|
| 지원 플랫폼 | iOS · Android · Web | **iOS · Web** (Android 제외) |
| 백엔드 | Supabase 등 PostgreSQL BaaS 권장 | **자체 API 서버(TypeScript) + PostgreSQL** (SYS-05 "동등한 클라우드 DB" 범주) |
| 배포 | 미정 | **배포하지 않음.** 맥북 로컬(Docker)에서 시연 |
| 날짜 판정 | 기기/브라우저 날짜 | **서버가 Asia/Seoul 기준으로 판정** (출석 · 일기 날짜 · 월 전환 모두) |
| 카탈로그 등급 | STANDARD/LIMITED (본문엔 SPECIAL 언급) | **STANDARD / LIMITED / SPECIAL** 3값 |
| 로그인 기록 | 없음 | **auth_events 테이블 추가**, 탈퇴 시 함께 삭제(NFR-14 준수) |

기존 PoC(`TaskAutomation/backend/haruleaf`, FastAPI + SQLite, v3.1)는 로직 참고용일 뿐 코드를 가져오지 않는다.

## 1. 전체 로드맵 (단계별로 설계 → 계획 → 구현)

1. 디자인 시스템 — 사용자가 Figma로 별도 진행
2. **기반 — 본 문서**
3. 회원가입 · 로그인 · 프로필 · 탈퇴
4. 홈 · 식물 선택 · 일기 · 성장률
5. 출석 코인 · 상점
6. 월 마감 · 정원

본 문서의 스키마와 API 목록은 3~6단계까지 포함한 전체 그림이며, **2단계에서 구현하는 것은 7절의 완료 기준까지**다.

## 2. 저장소 구조

```
~/HaruLeaf/                 git 저장소 루트, npm workspaces 모노레포
├─ apps/
│  ├─ app/                  Expo SDK 57 + Expo Router + TypeScript → iOS · Web
│  └─ server/               Fastify + Drizzle ORM + Zod → REST API
├─ packages/
│  └─ shared/               앱·서버 공용: Zod 스키마, API 타입, 성장률 계산
├─ scripts/dev.mjs          LAN IP 감지 후 서버 + Expo 동시 실행
├─ docker-compose.yml       PostgreSQL 16 (named volume으로 데이터 영구 보존)
├─ .env.example
└─ docs/
```

- 기존 `~/HaruLeaf/my-app`(Expo 57 템플릿, 초기 커밋 보유)을 `apps/app`으로 옮긴다. git 이력은 보존한다(저장소 루트를 `~/HaruLeaf`로 올림).
- 패키지 매니저는 npm workspaces (pnpm 미설치).
- Expo 패키지는 `npx expo install`로 추가한다(`apps/app/AGENTS.md` 규칙). Expo API를 쓰는 코드는 v57 문서를 확인하고 작성한다.

## 3. 실행 방식과 네트워크

- `npm run db:up` → Docker로 PostgreSQL 실행. 데이터는 볼륨 `haruleaf-pgdata`에 남아 컨테이너를 내렸다 올려도 유지된다.
- `npm run dev` → `scripts/dev.mjs`가
  1. 맥북의 Wi-Fi IPv4를 감지한다(없으면 `localhost`).
  2. `EXPO_PUBLIC_API_URL=http://<IP>:4000`, 서버 CORS 허용 출처에 `http://<IP>:8081`, `http://localhost:8081`을 넣는다.
  3. 서버(`0.0.0.0:4000`)와 Expo 개발 서버를 함께 실행한다.
- 모든 기기(iOS 시뮬레이터, 같은 Wi-Fi의 실제 아이폰(Expo Go), 브라우저)가 **같은 서버·같은 DB**를 사용하므로, 한 기기에서 가입한 계정으로 다른 기기에서 로그인하면 같은 데이터가 보인다.
- 발표장 Wi-Fi가 기기 간 통신을 막으면 맥북을 아이폰 핫스팟에 연결한다(README에 안내).

## 4. DB 스키마 (PostgreSQL 16)

공통: 시각은 `timestamptz`, 사용자 소유 데이터는 모두 `users(id)`를 `ON DELETE CASCADE`로 참조한다. 회원탈퇴 = `users` 행 삭제 한 번.

### 4.1 users — 프로필 (D1)
| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | uuid PK | 서버 발급 |
| login_id | varchar(30) UNIQUE NOT NULL | `^[a-z0-9_]{3,30}$`, 저장 시 소문자화 |
| nickname | varchar(30) NOT NULL | 공백 제거 후 1자 이상, 중복 허용 |
| coin_balance | integer NOT NULL DEFAULT 0 | `CHECK (coin_balance >= 0)` |
| created_at, updated_at | timestamptz NOT NULL | |

### 4.2 user_credentials — 비밀번호 (프로필과 분리, SYS-04)
| 컬럼 | 타입 | 제약 |
|---|---|---|
| user_id | uuid PK → users | CASCADE |
| password_hash | text NOT NULL | `scrypt$<salt>$<hash>` 형식, 원문 저장 금지 |
| updated_at | timestamptz NOT NULL | |

비밀번호 정책: 8~64자.

### 4.3 sessions
| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL → users | CASCADE |
| token_hash | char(64) UNIQUE NOT NULL | SHA-256(hex). 원문 토큰은 기기에만 존재 |
| platform | varchar(8) NOT NULL | `CHECK IN ('ios','web')` |
| created_at, last_used_at | timestamptz NOT NULL | |
| expires_at | timestamptz NOT NULL | 발급 후 30일 |
| revoked_at | timestamptz NULL | 로그아웃 시 기록 |

### 4.4 auth_events — 로그인 기록
| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | bigserial PK | |
| user_id | uuid NULL → users | CASCADE. 존재하지 않는 아이디 시도면 NULL |
| login_id | varchar(30) NOT NULL | 입력된 아이디(소문자화) |
| event | varchar(16) NOT NULL | `SIGNUP` / `LOGIN_SUCCESS` / `LOGIN_FAILED` / `LOGOUT` |
| platform | varchar(8) NOT NULL | `ios` / `web` |
| ip | text NULL | |
| user_agent | text NULL | |
| created_at | timestamptz NOT NULL | |

비밀번호(실패한 입력 포함)는 절대 기록하지 않는다. 탈퇴 시 해당 user_id의 기록은 CASCADE로 삭제되고, user_id가 NULL인 실패 기록(존재하지 않는 아이디)만 남는다.

### 4.5 plants — 카탈로그 (D4)
| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | varchar(40) PK | 예: `monstera` |
| name | varchar(40) NOT NULL | |
| description | text NOT NULL | |
| kind | varchar(8) NOT NULL | `PLANT` / `FLOWER` |
| catalog_class | varchar(10) NOT NULL | `STANDARD` / `LIMITED` / `SPECIAL` |
| initial_free | boolean NOT NULL | 초기 5종 |
| coin_price | integer NULL | `CHECK ((catalog_class = 'STANDARD' AND coin_price IS NULL) OR (catalog_class <> 'STANDARD' AND coin_price > 0))` |
| sort_order | integer NOT NULL | |
| is_active | boolean NOT NULL DEFAULT true | |

추가 제약: `CHECK (NOT initial_free OR catalog_class = 'STANDARD')`.
성장 이미지 경로는 DB에 두지 않고 앱의 `assets/plants/{id}/stage-{1..5}.webp` 규칙으로 찾는다(NFR-11).

### 4.6 user_plants — 보유 식물 (D5)
| 컬럼 | 타입 | 제약 |
|---|---|---|
| user_id | uuid → users | CASCADE, PK(user_id, plant_id) |
| plant_id | varchar(40) → plants | |
| unlock_source | varchar(12) NOT NULL | `INITIAL` / `ACHIEVEMENT` / `SHOP` |
| unlocked_at | timestamptz NOT NULL | |

### 4.7 diaries — 일기 (D2)
| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL → users | CASCADE |
| diary_date | date NOT NULL | `UNIQUE (user_id, diary_date)` |
| body | text NOT NULL | trim 후 1~10,000자 |
| created_at, updated_at | timestamptz NOT NULL | |

v3.2에 따라 코인 관련 컬럼 없음.

### 4.8 monthly_records — 월별 식물·결과 (D3)
| 컬럼 | 타입 | 제약 |
|---|---|---|
| user_id | uuid → users | CASCADE, PK(user_id, month) |
| month | date | 해당 월 1일 (`CHECK (EXTRACT(DAY FROM month) = 1)`) |
| plant_id | varchar(40) NULL → plants | |
| selection_locked | boolean NOT NULL DEFAULT false | 첫 일기 저장 시 true, 이후 일기 삭제해도 유지 |
| total_days | smallint NOT NULL | 28~31 |
| written_days | smallint NOT NULL DEFAULT 0 | 마감 시 확정 |
| growth_percent | numeric(5,2) NOT NULL DEFAULT 0 | 0~100, 마감 시 확정 |
| growth_stage | smallint NOT NULL DEFAULT 1 | 1~5, 마감 시 확정 |
| finalized | boolean NOT NULL DEFAULT false | |
| finalized_at | timestamptz NULL | |
| unlocked_plant_id | varchar(40) NULL → plants | 80% 달성 해금 식물. NOT NULL이면 이미 지급(중복 방지) |

진행 중인 달의 성장률은 `diaries`에서 즉석 계산해 응답하고, 마감 시 이 테이블에 고정한다.

### 4.9 coin_transactions — 코인 원장 (D6)
| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL → users | CASCADE |
| type | varchar(12) NOT NULL | `ATTENDANCE` / `PURCHASE` |
| amount | integer NOT NULL | `CHECK ((type = 'ATTENDANCE' AND amount > 0) OR (type = 'PURCHASE' AND amount < 0))` |
| reference_key | varchar(40) NOT NULL | 출석: `YYYY-MM-DD`, 구매: plant_id |
| created_at | timestamptz NOT NULL | |

`UNIQUE (user_id, type, reference_key)` → 하루 1회 출석, 식물당 1회 구매를 DB 수준에서 보장. 별도 구매 내역 테이블은 두지 않는다.

### 4.10 트랜잭션 규칙 (3~6단계 구현 시 준수)
- **출석**: 한 트랜잭션에서 ATTENDANCE 삽입 → `coin_balance += amount`. 유일 제약 위반이면 롤백 후 `ALREADY_ATTENDED`.
- **구매**: `SELECT … FROM users WHERE id = $1 FOR UPDATE` → 판매 대상(LIMITED/SPECIAL, active)·미보유·잔액 확인 → PURCHASE 삽입 → 잔액 차감 → user_plants(SHOP) 삽입.
- **월 마감**: 인증된 요청마다 사용자 행을 잠그고, `month < 이번 달 AND finalized = false`인 행을 오래된 순으로 확정. 성장률 ≥ 80이고 `unlocked_plant_id IS NULL`이면 미보유 active STANDARD 중 `sort_order`가 가장 작은 1종을 ACHIEVEMENT로 지급. 이번 달 행이 없으면 생성.

### 4.11 초기 시드 (임시값, 추후 교체 가능)
| id | 이름 | kind | class | 초기 | 가격 |
|---|---|---|---|---|---|
| monstera | 몬스테라 | PLANT | STANDARD | ✓ | – |
| rose | 장미 | FLOWER | STANDARD | ✓ | – |
| sunflower | 해바라기 | FLOWER | STANDARD | ✓ | – |
| tulip | 튤립 | FLOWER | STANDARD | ✓ | – |
| lavender | 라벤더 | FLOWER | STANDARD | ✓ | – |
| hydrangea | 수국 | FLOWER | STANDARD | | – |
| daisy | 데이지 | FLOWER | STANDARD | | – |
| moonflower | 달빛 꽃 | FLOWER | LIMITED | | 50 |
| anthurium | 산호빛 안스리움 | FLOWER | SPECIAL | | 100 |

시드는 멱등(upsert)으로 동작한다. 출석 1회 지급량 기본값은 `ATTENDANCE_COINS=5`(환경변수).

## 5. API 서버 (`apps/server`)

```
src/
├─ server.ts        listen(0.0.0.0:PORT)
├─ app.ts           buildApp(deps) — 테스트에서 inject로 재사용
├─ config.ts        환경변수 Zod 검증: DATABASE_URL, PORT, CORS_ORIGINS, ATTENDANCE_COINS, TZ_NAME(기본 Asia/Seoul)
├─ lib/clock.ts     Clock 인터페이스: today()는 TZ_NAME 기준 YYYY-MM-DD. 테스트용 고정 시계 주입
├─ lib/errors.ts    AppError(code, message, status) + 전역 에러 핸들러
├─ db/schema.ts     Drizzle 정의(4절)
├─ db/client.ts     pg Pool + drizzle 인스턴스
├─ db/migrations/   drizzle-kit generate 산출물(커밋 대상)
├─ db/seed.ts
├─ plugins/auth.ts  requireAuth: Bearer 토큰 → 세션 조회(미만료·미폐기) → request.user, last_used_at 갱신
├─ routes/health.ts
└─ domain/          (3~6단계) 출석·구매·월 마감 등 트랜잭션 로직
```

### 5.1 공통 규약
- JSON 요청/응답. 입력 검증은 `packages/shared`의 Zod 스키마.
- 오류 응답: `{ "error": { "code": string, "message": string } }`. `message`는 사용자에게 그대로 보여줄 한국어 문장. 검증 실패는 400 `VALIDATION_ERROR`, 인증 실패 401 `UNAUTHORIZED`, 예기치 못한 오류 500 `INTERNAL`(내부 정보 비노출).
- 요청 헤더 `X-Client-Platform: ios | web` (없거나 잘못되면 400). 세션·auth_events에 기록.
- 로그에 비밀번호, 토큰, 일기 본문을 남기지 않는다(Fastify 로거 redact 설정, NFR-09).

### 5.2 인증
- 토큰: `crypto.randomBytes(32)` base64url. DB에는 SHA-256 해시만 저장.
- 전송: `Authorization: Bearer <token>`. iOS는 `expo-secure-store`, Web은 `localStorage`에 보관(로컬 시연 MVP 기준의 절충, 쿠키 방식은 추후 과제).
- 비밀번호: Node `crypto.scrypt`(N=16384, r=8, p=1, 16바이트 salt), 비교는 `timingSafeEqual`.
- 로그인 실패 메시지는 아이디 존재 여부와 무관하게 동일: "아이디 또는 비밀번호가 올바르지 않습니다." 존재하지 않는 아이디도 더미 해시와 비교해 응답 시간을 맞춘다.

### 5.3 엔드포인트 전체 목록 (2단계에서는 `GET /health`만 구현)
| 단계 | 메서드 · 경로 | 설명 |
|---|---|---|
| 2 | `GET /health` | `{ status: "ok", db: "ok", today: "YYYY-MM-DD" }` (DB 연결 확인 포함) |
| 3 | `POST /auth/signup` | login_id, password, nickname → 토큰 + 사용자. 초기 5종 지급, SIGNUP 기록 |
| 3 | `POST /auth/login` | login_id, password → 토큰 + 사용자. 성공/실패 기록 |
| 3 | `POST /auth/logout` | 세션 폐기, LOGOUT 기록 |
| 3 | `GET /me` · `PATCH /me` · `DELETE /me` | 내 정보 · 닉네임 수정 · 비밀번호 재확인 후 탈퇴 |
| 4 | `GET /home` | 오늘 날짜, 이번 달 식물, 작성일수/전체일수, 성장률·단계, 잔액, 오늘 출석 여부, 오늘 일기 존재 여부 |
| 4 | `PUT /months/current/plant` | 이번 달 식물 선택(보유·미잠금 확인) |
| 4 | `GET /diaries?month=YYYY-MM` · `GET /diaries/:date` | 목록 · 상세 |
| 4 | `POST /diaries` | 오늘 날짜 일기 작성(식물 선택 필수, 선택 잠금) |
| 4 | `PUT /diaries/:date` · `DELETE /diaries/:date` | 이번 달 일기만 수정·삭제 |
| 5 | `POST /attendance` | 오늘 출석 |
| 5 | `GET /plants` · `POST /shop/purchase` | 카탈로그+보유 여부 · 구매 |
| 6 | `GET /garden?year=YYYY` | 1~12월 카드 |

월 마감은 별도 엔드포인트 없이 `requireAuth` 통과 후 공통 훅에서 수행(SYS-11).

## 6. 앱 (`apps/app`)

- `my-app` 템플릿의 예제 화면·컴포넌트·훅 제거. `app.json`: name `하루한잎`, slug `haruleaf`, scheme `haruleaf`, android 블록 삭제, 스플래시 색상 임시 토큰으로 교체.
- 라우트(Expo Router, `src/app/`):
  - `_layout.tsx` — AuthProvider, 세션 확인 중 스플래시 유지
  - `(auth)/login.tsx`, `(auth)/signup.tsx` — 2단계는 자리표시 화면
  - `(main)/_layout.tsx` — 탭: 홈 · 일기 · 정원 · 상점 · 프로필 (2단계는 자리표시)
- 라우트 외 코드는 `src/` 하위(`api/`, `auth/`, `theme/`, `components/`)에 둔다.
- `src/api/client.ts` — `EXPO_PUBLIC_API_URL` 기반 fetch 래퍼. 토큰·`X-Client-Platform`(`Platform.OS`) 자동 첨부, 오류를 `ApiError(code, message, status)`로 변환, 네트워크 실패는 `NETWORK_ERROR`("서버에 연결할 수 없어요"), 401이면 토큰 삭제 후 로그인 화면.
- `src/auth/tokenStore.ts` — iOS: `expo-secure-store`, Web: `localStorage` (try/catch로 감쌈). `.web.ts` 플랫폼 확장자로 분기.
- `src/theme/tokens.ts` — 색·타이포·간격·라운드 임시값. Figma 확정 후 이 파일만 교체.
- 공통 `Screen` 컴포넌트: SafeArea 적용 + 콘텐츠 최대 폭 960px 가운데 정렬(넓은 Web 화면 대응, NFR-04). 화면별 재배치는 디자인 확정 후 결정.
- 2단계 홈 자리표시 화면에 `GET /health` 결과(서버 연결 상태, 서버 기준 오늘 날짜)를 표시해 기기별 연결을 확인한다.

## 7. 2단계 완료 기준

1. `npm install` → `npm run db:up` → `npm run db:migrate` → `npm run db:seed` 후 4절의 테이블 9개와 시드 9건이 존재한다.
2. `npm run dev` 실행 후 iOS 시뮬레이터와 브라우저 모두에서 앱이 열리고, 화면에 "서버 연결 정상"과 서버 기준 오늘 날짜가 표시된다.
3. `npm test`(shared 단위 + server 통합), `npm run typecheck`, `npm run lint`가 모두 통과한다.
4. README에 설치·실행·실기기 접속·핫스팟 안내가 있다.

## 8. 테스트 전략

- `packages/shared` (Vitest, 순수 함수):
  - `daysInMonth`: 2026-02=28, 2028-02=29, 2026-09=30, 2026-10=31, 2100-02=28.
  - `growthPercent(written, total)`: 100 상한, 반올림 전 값 반환.
  - `growthStage`: 19.99→1, 20→2, 39.99→2, 40→3, 59.99→3, 60→4, 79.99→4, 80→5, 100→5.
  - `isFullyGrown`: 79.99 false, 80 true. 31일 달 24일=77.42% false, 25일=80.65% true.
- `apps/server` (Vitest + 실제 PostgreSQL `haruleaf_test` DB, `app.inject`):
  - 2단계: `/health` 200과 db ok, 잘못된 플랫폼 헤더 400 형식, 알 수 없는 오류 500 형식(내부 메시지 비노출), 마이그레이션 후 테이블·제약 존재, 시드 멱등성(2회 실행 후 9건).
  - 3~6단계 테스트는 각 단계 설계에서 정의(출석 동시 요청, 구매 동시 요청, 12→1월 마감, 탈퇴 CASCADE 등).
- `apps/app`: `tsc --noEmit`, `expo lint`. 브라우저(미리보기)와 iOS 시뮬레이터에서 health 표시를 직접 확인.

## 9. 범위 밖 (2단계에서 하지 않음)

- 실제 기능 화면·API(3~6단계), 디자인 시스템 적용(1단계 결과 대기), 식물 이미지 자산, 배포, Android, 쿠키 기반 Web 인증, 로그인 시도 횟수 제한.
