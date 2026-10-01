# HaruLeaf 6단계 — 월 마감·STANDARD 해금·정원 설계

- 작성일: 2026-10-01
- 기준: 명세서 v3.2(FR-08·12·17·18, SYS-11, UI-06, BR-07·09, 프로세스 1.x 월 마감·3.1 STANDARD 해금·6.0 정원 조회, QA 일반 식물 해금), 5단계 최종 리뷰 이월 항목
- 선행 상태: 5단계(출석 코인·상점) 병합 완료

## 0. 범위
**포함**: 선행 작업 A~C, 월 마감(지연 마감), 80% 이상 STANDARD 무작위 해금, 해금 안내·확인, 정원 연도별 12개월 카드, 월 상세, 시연용 지난달 기록 명령, 배지 한국어, 출석 버튼 "(+n)".
**제외**: 예약 작업(cron), 월 마감 코인 보너스(v3.2에서 제외), 해금 애니메이션, 실제 식물 이미지(사용자 제공 시 교체).

## 1. 확정 결정
| 항목 | 결정 |
|---|---|
| 마감 시점 | 요청 시 지연 마감. `GET /home`·`GET /plants`·`GET /garden`·`GET /garden/:month`가 처리 전에 `closePastMonths` 실행 |
| 마감 대상 | `monthly_records` 중 `month < 이번 달 1일`이고 `finalized = false`인 행 전부. 행이 없는 달은 만들지 않음(정원 빈 카드) |
| 확정값 | 마감 시 작성일수·성장률·단계를 계산해 `written_days`·`growth_percent`·`growth_stage`에 저장, `finalized = true`, `finalized_at = now()`. 마감된 월은 다시 쓰지 않음 |
| 해금 조건 | 식물을 고른 달이고 반올림 전 성장률 ≥ 80 |
| 해금 대상 | 활성·미보유 STANDARD 중 **무작위** 1종. 선택 함수 `pickUnlock(candidateIds) => id`는 의존성으로 주입(기본 `Math.random`, 테스트는 고정). 후보가 없으면 해금 없이 마감 |
| 해금 기록 | `user_plants`(ACHIEVEMENT, `onConflictDoNothing`) + `monthly_records.unlocked_plant_id`. `unlocked_plant_id`가 명세서 `standard_unlock_issued` 역할 |
| 해금 안내 | 홈에 확인 전까지 표시. 확인 여부는 서버 `monthly_records.unlock_acknowledged_at`(마이그레이션 `0002_unlock_ack`) |
| 정원 연도 범위 | 가입 연도(`users.created_at`, Asia/Seoul) ~ 올해 |
| 시연 | 개발용 CLI `npm run dev:seed-month -- <아이디> <YYYY-MM> <식물ID> <일수>` (HTTP 비노출) |
| 코인 | 마감은 코인을 건드리지 않음 |

## 2. 선행 작업 (5단계 리뷰 이월)
- **A** `protected.test.ts` 401 표에 `/unlocks/ack`, `/garden`, `/garden/2026-09` 추가.
- **B** OPTIONS 테스트가 204 + `access-control-allow-origin` 헤더를 확인.
- **C** 상점 테스트: 비활성 LIMITED 구매 404 `PLANT_NOT_FOUND`, 본문 형식 오류 400.

## 3. 서버
### 3.1 DB
마이그레이션 `0002_unlock_ack`: `monthly_records.unlock_acknowledged_at timestamptz null`.

### 3.2 마감 (`domain/closing.ts`)
`closePastMonths(db, userId, today, pickUnlock)` — 한 트랜잭션:
1. `month < monthStartOf(today) and finalized = false` 행을 `month` 오름차순 `FOR UPDATE`로 잠금(동시 요청은 같은 순서로 대기 → 교착 없음).
2. 잠근 행마다(이미 `finalized`면 건너뜀) 해당 월 diaries 수로 성장값 계산(shared `growthPercent`·`growthStage`).
3. 조건 충족 시 활성·미보유 STANDARD id 목록 → `pickUnlock` → `user_plants` 삽입 → 그 id를 `unlocked_plant_id`로.
4. 확정값·`finalized`·`finalized_at` 갱신.
마감할 행이 없으면 트랜잭션 없이 빠르게 반환(조회 1회). 여러 달이 밀려 있어도 한 트랜잭션에서 순서대로 처리하므로 같은 식물이 두 번 뽑히지 않는다.

### 3.3 마감된 월 스냅샷
`monthSnapshot`은 `finalized`면 저장된 확정값(`growth_percent`는 문자열 → `Number`)을 쓰고, 아니면 기존처럼 실시간 계산.

### 3.4 API (보호 라우트)
| API | 응답 | 오류 |
|---|---|---|
| `GET /home` | 기존 + `newUnlocks: UnlockNotice[]`(마감·해금됐고 미확인, 월 오름차순), `attendanceCoins: number` | |
| `POST /unlocks/ack` `{ months: string[] }`(YYYY-MM, 1~24개) | `OkResponse`. 본인 행 중 해금 있고 미확인인 것만 `unlock_acknowledged_at = now()`(이미 확인·없는 월은 무시) | 400 형식 |
| `GET /garden?year=YYYY`(생략 시 올해) | `GardenResponse = { year, minYear, maxYear, months: GardenMonth[12] }` | 400 `INVALID_YEAR` "볼 수 없는 연도예요."(범위 밖) |
| `GET /garden/:month` | `{ month: GardenMonth }` | 400 형식, 400 `INVALID_YEAR`(범위 밖 연도) |

```ts
type UnlockNotice = { month: string; plant: PlantSummary };
type GardenMonthStatus = 'FINALIZED' | 'CURRENT' | 'NO_PLANT' | 'EMPTY';
type GardenMonth = {
  month: string;            // YYYY-MM
  status: GardenMonthStatus;
  plant: PlantSummary | null;
  writtenDays: number; totalDays: number;
  growthPercent: number; growthStage: GrowthStage; fullyGrown: boolean;
  unlockedPlant: PlantSummary | null;
};
```
상태: 이번 달 → `CURRENT`(식물 없어도), 지난 달 행 있고 식물 있음 → `FINALIZED`, 지난 달 행 있고 식물 없음 → `NO_PLANT`, 행 없음·미래 → `EMPTY`(값 0, stage 1).

### 3.5 개발용 지난달 기록
`seedMonth(db, loginId, month, plantId, days, today)` — 한 트랜잭션:
- 거절: 없는 아이디, `month >= 이번 달`, 이미 마감된 월, 없는·미보유 식물, `days`가 0~그 달 일수 밖 정수.
- 처리: 월 행 생성 → `plant_id`, `selection_locked = days > 0` → 1일~`days`일 diaries 삽입(본문 "시연용 일기입니다.", 기존 날짜는 유지 `onConflictDoNothing`).
CLI `apps/server/src/scripts/seed-month.ts`, 루트 `npm run dev:seed-month -- <아이디> <YYYY-MM> <식물ID> <일수>`. README "시연용 지난달 기록" 절.

## 4. 앱
- **shared**: `catalogClassLabel(cls)` → STANDARD "기본", LIMITED "한정", SPECIAL "스페셜". 상점 배지에 적용.
- **홈**
  - `newUnlocks`가 있으면 출석 카드 위에 해금 안내 카드: "지난달 기록으로 ○○을(를) 정원 식구로 맞았어요."(여러 개면 줄마다 "YYYY년 M월 · ○○"), [확인] → `POST /unlocks/ack` 후 `reload()`, [식물 고르기] → `/plants`.
  - 출석 버튼 "출석하기 (+n)" (`attendanceCoins`).
- **정원 탭**: ◀ YYYY년 ▶(minYear~maxYear 밖은 비활성), 12개월 카드 격자(웹 넓은 화면 4열, 그 외 3열). 카드: 월, 식물 그림(`growthStage`), 성장률 소수 1자리, 상태별 문구("진행 중"·"식물 없음"·빈 카드는 흐리게). `EMPTY`는 누를 수 없음. 탭 재방문 시 올해로(`tabPress`).
- **월 상세** `/garden/[month]`(hidden): 큰 식물 그림·이름·"77.4% · 24/31일"·완전 성장 표시·"이 달에 ○○ 해금", 그 달 일기 목록(`GET /diaries?month=`) → `/entry/[date]`. 지난 달은 "읽기 전용" 배지.

## 5. 테스트
- 마감: 31일 달 24일 → 해금 없음·finalized, 25일 → 해금 1종(ACHIEVEMENT)·`unlocked_plant_id`, 식물 없는 달 finalized·해금 없음, 미보유 STANDARD 없음 → 해금 없음, 여러 달 밀림 → 순서대로·중복 식물 없음, 재호출 시 `finalized_at` 불변, 동시 `/home` 10회 → 해금 1건, 이번 달은 마감 안 됨, 마감 후 코인 잔액·원장 불변, 무작위 선택 함수가 후보 목록을 받음.
- 스냅샷: 마감된 월은 저장값 사용.
- 해금 안내: `/home` `newUnlocks`, ack 후 사라짐, 다른 사용자 월 ack 무시, 형식 오류 400.
- 정원: 상태 4종, 연도 범위 400, 가입 연도·올해 경계, 월 상세.
- 개발 명령: 성공 후 `/home`에서 마감·해금, 거절 케이스 전부.
- 선행 A~C.

## 6. 완료 기준
1. `npm test`·`typecheck`·`lint` 통과.
2. `dev:seed-month`로 9월 25일 기록 → iOS 홈 해금 안내 → Web 홈 같은 안내 → Web [확인] → iOS 새로고침 시 사라짐 → 식물 고르기에 해금 식물 보유 → 정원 9월 카드 완료·10월 진행 중 → 9월 상세에서 일기 읽기 전용.
