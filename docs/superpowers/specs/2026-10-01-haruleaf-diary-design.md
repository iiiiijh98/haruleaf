# HaruLeaf 4단계 — 홈·식물 선택·일기·성장률 설계

- 작성일: 2026-10-01
- 기준: `HaruLeaf_요구사항_명세서_v3.2_React.docx`(FR-05~11, BR-03~06·08, UI-03~05, SYS-06~08), 기반 설계(2단계), 3단계 설계와 그 최종 리뷰의 이월 항목
- 선행 상태: 3단계(인증) 병합 완료 — 가입·로그인·`/me`, 앱 인증 상태·폼 컴포넌트

## 0. 범위

**포함**: 선행 작업 A~E, 이번 달 식물 선택, 일기 작성·조회·수정·삭제, 월 기준 성장률·단계, 홈·식물 선택·일기 화면, 식물 그림 컴포넌트(임시 PNG).

**제외**: 지난달 마감·STANDARD 해금·정원(6단계), 출석 코인·상점(5단계), 실제 식물 이미지(사용자 제공 시 파일 교체).

## 1. 확정 결정

| 항목 | 결정 |
|---|---|
| 식물 미선택 상태의 일기 | 불가. 홈에서 식물 선택을 먼저 요구하고 서버도 `PLANT_NOT_SELECTED`로 거절 |
| 일기 날짜 | 서버 기준 오늘(`clock.today()`, Asia/Seoul)만 신규 작성. 클라이언트가 날짜를 보내지 않음 |
| 수정·삭제 | 이번 달(서버 기준) 일기만. 지난달은 `MONTH_CLOSED` 403 "지난달 기록은 읽기 전용이에요." |
| 식물 잠금 | 첫 일기 저장 시 `selection_locked = true`, 이후 그 일기를 지워도 유지(BR-08) |
| 성장률 | 작성일수 ÷ 해당 월 전체 일수 × 100, 100 상한, 단계는 반올림 전 값으로 판정. 화면 표시는 소수점 첫째 자리(BR-05) |
| 일기 본문 | trim 후 1~10,000자(코드포인트), NUL 금지, 내부 줄바꿈 유지 |
| 코인 | 일기와 무관(명세서 v3.2). 이번 단계에서 코인 처리 없음 |
| 식물 그림 | `assets/plants/{plantId}/stage-{1..5}.png`, 투명 배경 1024×1024. 지금은 초기 5종 임시 PNG 25장, 사용자 제공 이미지로 같은 경로 교체. 그림 없는 식물은 기본 그림 |

## 2. 선행 작업 (3단계 리뷰 이월)

- **A. 오류 로그 스택 필터** — `serializeError`가 스택 앞의 `${name}: ${message}` 헤더(여러 줄일 수 있음)를 먼저 제거하고, `^\s+at .+:\d+:\d+\)?$` 형식의 줄만 남긴다. 테스트: 파라미터에 `"첫 줄\nat secret-diary"`가 들어간 실패 쿼리 → 로그에 `secret-diary` 없음.
- **B. NUL 금지 텍스트 규칙** — shared에 `hasNoNul` 검사(메시지 "사용할 수 없는 문자가 들어 있어요.")를 두고 `nicknameSchema`와 `diaryBodySchema`에 적용.
- **C. `unauthorized()`** — `lib/errors.ts`에 `unauthorized()` 팩토리를 두고 `domain/accounts.ts`, `plugins/auth.ts`의 중복 정의를 제거.
- **D. 보호 라우트 플러그인** — `routes/protected.ts`가 캡슐화된 플러그인에 `addHook('onRequest', requireAuth)`를 걸고 `/auth/logout`, `/me*`, 4단계 라우트를 그 안에 등록. 인증 실패는 본문 파싱 전에 401. `authOf(request)` 접근자는 유지.
- **E. `last_used_at` 갱신 제한** — `authenticate`는 `last_used_at`이 5분 이상 지났을 때만 UPDATE.

## 3. 서버

### 3.1 이번 달 기록
`ensureMonth(db, userId, monthStart)` — `monthly_records`에 (user_id, month) 행이 없으면 `total_days = daysInMonth`로 생성(`ON CONFLICT DO NOTHING`), 행을 반환. `GET /home`, `PUT /months/current/plant`, `POST /diaries`가 호출. 월 키는 `clock.today()`의 `YYYY-MM-01`.

### 3.2 성장 스냅샷
`monthSnapshot(db, userId, month)` → `{ month: 'YYYY-MM', plant: PlantSummary | null, selectionLocked, writtenDays, totalDays, growthPercent, growthStage, fullyGrown }`. `writtenDays`는 해당 월 `diaries` 행 수(사용자+날짜 유일이므로 서로 다른 날짜 수와 같음). 계산은 shared `daysInMonth`·`growthPercent`·`growthStage`·`isFullyGrown`.

### 3.3 API (모두 보호 라우트)

| 메서드 · 경로 | 입력 | 응답 | 오류 |
|---|---|---|---|
| `GET /home` | – | `HomeResponse = MonthSnapshot & { today: string; todayDiary: boolean }` | |
| `GET /plants` | – | `{ plants: CatalogPlant[] }` — `{ id, name, description, kind, catalogClass, coinPrice, owned }`, active만, `sort_order` 순 | |
| `PUT /months/current/plant` | `{ plantId }` | `HomeResponse` | 404 `PLANT_NOT_FOUND`, 403 `PLANT_NOT_OWNED` "보유한 식물만 고를 수 있어요.", 409 `SELECTION_LOCKED` "첫 일기를 쓴 달은 식물을 바꿀 수 없어요." |
| `POST /diaries` | `{ body }` | 201 `{ diary: DiaryEntry }` | 409 `PLANT_NOT_SELECTED` "이번 달 식물을 먼저 골라주세요.", 409 `DIARY_EXISTS` "오늘 일기는 이미 있어요. 수정해주세요." |
| `GET /diaries?month=YYYY-MM` | month(생략 시 이번 달) | `{ month, editable: boolean, diaries: DiaryEntry[] }` 최신순 | 400(형식) |
| `GET /diaries/:date` | `YYYY-MM-DD` | `{ diary: DiaryEntry, editable: boolean }` | 404 `DIARY_NOT_FOUND` "일기를 찾을 수 없어요." |
| `PUT /diaries/:date` | `{ body }` | `{ diary }` | 403 `MONTH_CLOSED`, 404 |
| `DELETE /diaries/:date` | – | `OkResponse` | 403 `MONTH_CLOSED`, 404 |

`DiaryEntry = { date: 'YYYY-MM-DD', body, createdAt, updatedAt }`. `editable`은 해당 월 == 이번 달.

### 3.4 트랜잭션
- 일기 작성: 한 트랜잭션에서 이번 달 행 잠금(`SELECT … FOR UPDATE`) → 식물 선택 확인 → diaries 삽입(유일 제약 위반 → `DIARY_EXISTS`) → `selection_locked = true`.
- 식물 선택: 이번 달 행 잠금 → 보유 확인 → 잠금 확인 → `plant_id` 갱신. (동시에 첫 일기와 식물 변경이 들어와도 잠금 이후 변경 불가)

## 4. 앱

### 4.1 라우트
- `(main)/_layout.tsx` 탭은 그대로(홈·일기·정원·상점·프로필). 탭 바에 나오지 않는 화면 추가(`href: null`): `diary/write`, `diary/[date]`, `plants/select`.
- 공통 데이터 훅: `useHome()`(GET /home, 화면 포커스 시 재조회), `usePlants()`, `useDiaries(month)`. 저장·삭제·선택 후 해당 데이터를 다시 불러온다.

### 4.2 화면
| 화면 | 내용 |
|---|---|
| 홈 | 인사말 → (식물 없음) 안내 + [식물 고르기] / (식물 있음) `PlantImage`(단계 변경 시 페이드) · 식물 이름 · 진행 바 · "33.3% · 10/30일" · 80% 이상 "완전히 자랐어요!" → [오늘 일기 쓰기] 또는 [오늘 일기 보기] |
| 식물 선택 | 카탈로그 격자. 보유 → 선택 가능, 잠긴 STANDARD "꾸준히 기록하면 해금", LIMITED/SPECIAL "상점에서 만나요". 고정된 달이면 안내만 |
| 일기 탭 | ◀ YYYY년 M월 ▶(이번 달 이후로는 이동 불가), 날짜·첫 줄 미리보기 목록, 지난달 "읽기 전용" 배지, 이번 달에 오늘 일기 없으면 [오늘 일기 쓰기] |
| 일기 쓰기 | 여러 줄 입력, 글자 수 `n/10,000`, 저장. 식물 미선택이면 식물 선택으로 안내 |
| 일기 상세 | 본문, 이번 달이면 [수정](같은 입력 화면 재사용)·[삭제](ConfirmModal), 지난달은 읽기 전용 |

### 4.3 식물 그림
- `PlantImage({ plantId, stage, size })` — 정적 `require` 맵(`assets/plants/index.ts`)에서 찾고 없으면 기본 그림. 단계가 바뀌면 `Animated` opacity 페이드(200ms).
- 임시 PNG: 초기 5종 × 5단계 = 25장 + 기본 그림 5장(`assets/plants/_default/stage-{1..5}.png`). 단계별로 크기가 커지는 단순한 화분·새싹 실루엣, 식물별 색만 다름. 사용자가 이미지를 주면 같은 경로에 덮어쓴다.

## 5. 테스트

- **shared**: `diaryBodySchema`(빈 값·공백만·10,000/10,001자·NUL·줄바꿈 유지), 닉네임 NUL 거절, `hasNoNul`.
- **server**(fixedClock):
  - 선행: 스택 필터 여러 줄 테스트, 보호 플러그인(본문 깨진 요청도 미인증이면 401), `last_used_at` 5분 제한.
  - 홈: 2026-02(28)·2028-02(29)·2026-09(30)·2026-10(31) 경계값, 31일 달 24일 77.4%(stage 4, 미완성)·25일 80.6%(stage 5, 완전).
  - 식물: 미보유 403, 잠금 후 409, 일기 삭제 후에도 잠금 유지, 없는 식물 404.
  - 일기: 미선택 409, 하루 1편, 날짜는 서버 기준, 다른 사용자 일기 404, 목록 최신순·월 필터.
  - 월 경계: 시계를 다음 달로 → 지난달 수정/삭제 403, 새 달 홈은 식물 없음, 지난달 목록 `editable: false`.
- **app**: typecheck·lint. 컨트롤러 수동 교차 확인(iOS 작성 → Web 홈 반영 → Web 삭제 → iOS 0%).

## 6. 완료 기준
1. `npm test`·`npm run typecheck`·`npm run lint` 통과.
2. iOS에서 식물 선택 → 오늘 일기 작성 → Web 홈에 같은 식물과 "3.2% · 1/31일"(10월) 표시 → Web에서 삭제 → iOS 홈 0%.
3. 일기 저장 실패 시에도 서버 로그에 본문이 없다.
