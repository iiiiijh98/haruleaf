# HaruLeaf 5단계 — 출석 코인·상점 설계

- 작성일: 2026-10-01
- 기준: 명세서 v3.2(FR-13~16·20, BR-10~13·16, UI-03·07, SYS-09·10·14, QA-07·08·12), 4단계 최종 리뷰 이월 항목
- 선행 상태: 4단계(홈·식물 선택·일기·성장률) 병합 완료

## 0. 범위
**포함**: 선행 작업 A~E, 출석 코인, 홈 잔액·출석 상태, 상점 목록·구매, 개발용 코인 지급 명령, 홈·상점 화면.
**제외**: 실제 결제, LIMITED 판매 기간 제한, 코인 내역 화면, 월 마감·정원(6단계).

## 1. 확정 결정
| 항목 | 결정 |
|---|---|
| 출석 지급량 | `ATTENDANCE_COINS` 환경변수(기본 5) |
| 가격 | 카탈로그 그대로(LIMITED 달빛 꽃 50, SPECIAL 산호빛 안스리움 100) |
| 시작 잔액 | 0 |
| 시연 | 개발용 CLI `npm run dev:grant-coins -- <아이디> <양>` (HTTP 비노출, 원장 `ADJUSTMENT`) |
| 출석 판정 | 서버 기준 오늘(`clock.today()`), 원장 `(user_id, ATTENDANCE, 날짜)` 유일 |
| 구매 | 사용자 행 `FOR UPDATE` 잠금 후 판매 대상·미보유·잔액 확인 → PURCHASE 기록 → 차감 → user_plants(SHOP) |
| 잔액 표시 | `/home`·`/shop`·출석·구매 응답 값 사용(로그인 시점 `/me` 값은 표시에 쓰지 않음) |

## 2. 선행 작업
- **A** `Tx`/`Executor` 타입을 `db/client.ts`로 이동, accounts·months·이후 도메인이 import.
- **B** 표 기반 401 테스트: 모든 보호 라우트가 토큰 없이 401, `/health`·가입·로그인·OPTIONS는 공개.
- **C** 동시 요청 도우미 `fireConcurrently(n, fn)` + 일기 동시 작성 테스트(1건 201, 나머지 409).
- **D** `listPlants` 정렬에 `asc(plants.id)` 추가, 비활성 식물 선택 404 테스트, 두 사용자 `owned` 분리 테스트.
- **E** `selectPlant`가 `clock.today()`를 한 번만 읽고 그 날짜로 홈 응답 생성.

## 3. 서버
### 3.1 DB
`coin_transactions_amount_sign` CHECK에 `(type = 'ADJUSTMENT' and amount > 0)` 추가(마이그레이션 `0001_coin_adjustment`).

### 3.2 API (보호 라우트)
| API | 응답 | 오류 |
|---|---|---|
| `GET /home` | 기존 + `coinBalance: number`, `attendedToday: boolean` | |
| `POST /attendance` | `AttendanceResponse = { coinBalance, attendedToday: true, earned }` | 409 `ALREADY_ATTENDED` "오늘은 이미 출석했어요." |
| `GET /shop` | `ShopResponse = { coinBalance, items: ShopItem[] }` — `ShopItem = { id, name, description, kind, catalogClass: 'LIMITED'｜'SPECIAL', coinPrice, owned }`, active만, sort_order·id 순 | |
| `POST /shop/purchase` `{ plantId }` | `PurchaseResponse = { coinBalance, plant: PlantSummary }` | 404 `PLANT_NOT_FOUND`, 400 `NOT_FOR_SALE` "상점에서 파는 식물이 아니에요.", 409 `ALREADY_OWNED` "이미 가진 식물이에요.", 409 `INSUFFICIENT_COINS` "코인이 부족해요." |

### 3.3 개발용 지급
`grantCoins(db, loginId, amount)` — amount 1~100,000 정수, 없는 아이디는 오류, 한 트랜잭션에서 `ADJUSTMENT`(reference_key `adj:<uuid 32자>`) 기록 + 잔액 증가. CLI `apps/server/src/scripts/grant-coins.ts`, 루트 `npm run dev:grant-coins -- <아이디> <양>`.

## 4. 앱
- **홈**: 인사말 아래 잔액 카드 — "🪙 n코인" + [출석하기 (+5)] / 출석한 날 "오늘 출석 완료"(비활성). 식물 유무와 무관하게 항상 표시.
- **상점 탭**: 잔액, LIMITED/SPECIAL 카드(그림 5단계·이름·설명·배지·가격), 보유 시 "보유 중", 잔액 부족 시 비활성 + "n코인 더 필요해요", 구매 확인 모달 → 성공 안내 "○○을(를) 정원 식구로 맞았어요. 식물 고르기에서 선택할 수 있어요." 탭 재방문 시 상태 초기화(`useIsFocused`).
- **식물 선택**: 산 식물이 보유 상태로 표시(기존 로직).

## 5. 테스트
- 출석: 1회 지급·잔액 증가, 같은 날 두 번째 409, 동시 10회 → 1회만, 날짜 변경 후 재출석, 일기 작성·삭제 시 잔액 불변, 홈 `attendedToday` 반영.
- 구매: 잔액 부족 409 + 아무 변화 없음, 성공 시 차감·보유·원장, 중복 409, STANDARD 400, 없는 식물 404, 동시 구매 2회 → 1회만, 산 식물로 이번 달 식물 선택 가능.
- 개발 지급: 잔액·원장 반영, 없는 아이디·범위 밖 양 거절.
- 선행: 401 표, 동시 일기, listPlants 정렬·분리, 비활성 404.

## 6. 완료 기준
1. `npm test`·`typecheck`·`lint` 통과.
2. iOS 출석 → Web 홈 같은 잔액·"오늘 출석 완료". 개발 명령으로 코인 지급 → Web 상점에서 달빛 꽃 구매 → iOS 식물 선택에 달빛 꽃 보유.
