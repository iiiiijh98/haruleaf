# HaruLeaf 3단계 — 회원가입·로그인·프로필·탈퇴 설계

- 작성일: 2026-09-30
- 기준: `HaruLeaf_요구사항_명세서_v3.2_React.docx`(FR-01~03, FR-18, FR-21~22, NFR-07~09, NFR-14, UI-01·02·08, BR-01·02·18, SYS-02~04·15), 기반 설계 `2026-09-30-haruleaf-foundation-design.md`
- 선행 상태: 2단계(기반) 병합 완료 — 스키마 9개 테이블, `GET /health`, 앱 뼈대(AuthProvider·Stack.Protected·tokenStore·apiRequest)

## 0. 범위

**포함**
1. 선행 작업 A — zod 단일 인스턴스화
2. 선행 작업 B — 오류 로그 민감정보 제거, 검증 메시지 한국어화
3. 서버: 회원가입·로그인·로그아웃·내 정보 조회/닉네임 수정/탈퇴 API, `requireAuth` 플러그인
4. 앱: 로그인·회원가입·프로필 화면, 홈 인사 문구, 인증 상태 확장
5. 테스트와 교차 기기 확인

**제외**: 홈 식물·성장률(4단계), 코인(5단계), 로그인 시도 횟수 제한, 비밀번호 변경/찾기(명세서상 MVP 제외).

## 1. 입력 규칙 (확정)

| 항목 | 규칙 | 오류 메시지 |
|---|---|---|
| 아이디 | 입력값을 trim 후 소문자로 변환. `^[a-z0-9_]{3,20}$` | "아이디는 영문 소문자·숫자·_ 3~20자로 입력해주세요." |
| 비밀번호 | 8~64자, 공백 불가, 대문자(`[A-Z]`)·숫자(`[0-9]`)·특수문자(`[^A-Za-z0-9\s]`) 각 1자 이상 | 길이: "비밀번호는 8~64자로 입력해주세요." / 공백: "비밀번호에는 공백을 쓸 수 없어요." / 조합: "비밀번호에 대문자·숫자·특수문자를 각각 1자 이상 넣어주세요." |
| 닉네임 | trim 후 1~10자(코드포인트 기준, `Array.from(s).length`) | "닉네임은 1~10자로 입력해주세요." |

- 회원가입 화면은 명세서 UI-01대로 입력칸 3개만 두고, 비밀번호 칸에 보기/숨기기 토글을 둔다(비밀번호 확인 칸 없음).
- DB 제약(아이디 3~30자, 닉네임 30자 이하)은 그대로 두고, 더 좁은 규칙은 shared 스키마가 강제한다.
- 로그인 요청의 비밀번호는 형식 규칙을 검사하지 않는다(길이 1~64만 확인) — 규칙이 바뀌어도 기존 계정이 로그인할 수 있게.

## 2. 선행 작업

### 2.1 zod 단일 인스턴스 (A)
- Expo CLI·eslint 플러그인이 zod 3을 요구해 루트는 zod 3.25.76, shared·server에 zod 4.6.5가 각각 중첩 설치된 상태.
- 결정: **`@haruleaf/shared`가 `export { z } from 'zod'`로 zod를 재수출하고, 서버는 zod를 직접 의존하지 않는다**(`apps/server/package.json`에서 zod 제거, 모든 import를 `@haruleaf/shared`로). 앱도 zod가 필요하면 shared에서 가져온다.
- `errors.ts`의 이름 기반 우회(`isZodError`)는 `instanceof z.ZodError`로 되돌린다.
- 회귀 테스트: 서버 기준 `require.resolve('zod')` 결과가 shared의 zod와 같은 경로인지, 저장소에서 앱 외부(`apps/server`, `packages/shared`)에 zod 4 사본이 하나뿐인지 확인.

### 2.2 오류 로그 정리 (B)
- 500 경로 로그는 `serializeError(error)` 결과만 남긴다: `{ name, code, constraint, table, stack }` (`code/constraint/table`은 `error.cause`의 pg 필드). `message`는 남기지 않는다 — drizzle `DrizzleQueryError.message`에 쿼리 파라미터가 들어있기 때문.
- 테스트: 민감 문자열이 파라미터로 들어간 쿼리를 실패시키는 테스트 라우트 → 로거 출력 캡처에 그 문자열이 없어야 한다.
- `VALIDATION_ERROR`의 메시지는 shared 스키마의 한국어 메시지(첫 issue)를 그대로 쓴다. 메시지 없는 issue는 "입력값을 확인해주세요."

## 3. 공용 스키마·타입 (`packages/shared/src/auth.ts`)

```ts
loginIdSchema, passwordSchema, nicknameSchema
signupSchema        = { loginId, password, nickname }
loginSchema         = { loginId: loginIdInput(trim+lowercase, 1~30자), password: string 1~64 }
updateNicknameSchema = { nickname }
deleteAccountSchema = { password: string 1~64 }

type User = { id: string; loginId: string; nickname: string; coinBalance: number; createdAt: string }
type AuthResponse = { token: string; user: User }
type MeResponse = { user: User }
type OkResponse = { ok: true }
```

## 4. 서버

### 4.1 구조
```
src/lib/password.ts     hashPassword(pw) → 'scrypt$<saltHex>$<hashHex>', verifyPassword(pw, stored), DUMMY_PASSWORD_HASH
src/lib/token.ts        createToken() → base64url(32바이트), hashToken(token) → sha256 hex
src/lib/request-meta.ts clientMeta(request) → { platform, ip, userAgent }
src/plugins/auth.ts     requireAuth preHandler → request.user = { id, sessionId }
src/domain/accounts.ts  signup / login / logout / getUser / updateNickname / deleteAccount
src/routes/auth.ts      POST /auth/signup · /auth/login · /auth/logout
src/routes/me.ts        GET /me · PATCH /me · DELETE /me
```
- scrypt: N=16384, r=8, p=1, salt 16바이트, keylen 64, 비교는 `timingSafeEqual`. 비동기(`crypto.scrypt` promisify).
- 세션 유효 조건: `token_hash` 일치 AND `revoked_at IS NULL` AND `expires_at > now()`. 통과 시 `last_used_at = now()` 갱신.
- 세션 만료: 발급 시각 + 30일(고정). 로그인할 때마다 새 세션을 만들며, 기기별 동시 로그인을 허용한다.

### 4.2 엔드포인트

| 메서드 · 경로 | 인증 | 입력 | 성공 응답 | 실패 |
|---|---|---|---|---|
| `POST /auth/signup` | – | signupSchema | 201 `AuthResponse` | 409 `LOGIN_ID_TAKEN` "이미 사용 중인 아이디입니다." |
| `POST /auth/login` | – | loginSchema | 200 `AuthResponse` | 401 `INVALID_CREDENTIALS` "아이디 또는 비밀번호가 올바르지 않습니다." |
| `POST /auth/logout` | ✓ | – | 200 `OkResponse` | 401 |
| `GET /me` | ✓ | – | 200 `MeResponse` | 401 |
| `PATCH /me` | ✓ | updateNicknameSchema | 200 `MeResponse` | 400 |
| `DELETE /me` | ✓ | deleteAccountSchema | 200 `OkResponse` | 401 `INVALID_PASSWORD` "비밀번호가 올바르지 않습니다." |

인증 실패는 모두 401 `UNAUTHORIZED` "다시 로그인해주세요."

### 4.3 트랜잭션·기록 규칙
- **가입**(한 트랜잭션): users 삽입(login_id 소문자) → user_credentials → `plants.initial_free AND is_active` 전부를 user_plants(INITIAL)로 → sessions → auth_events(`SIGNUP`). login_id 유일 제약 위반(23505, `users_login_id_unique`)은 `LOGIN_ID_TAKEN`으로 변환 — 동시 가입 요청도 1건만 성공.
- **로그인**: 사용자 조회 → 없으면 `DUMMY_PASSWORD_HASH`로 검증(응답 시간 균일화) → 실패 시 auth_events(`LOGIN_FAILED`, user_id = 사용자 id 또는 NULL, login_id는 입력값 소문자·앞 30자) → 401. 성공 시 세션 + `LOGIN_SUCCESS`.
- **로그아웃**: 현재 세션 `revoked_at = now()` + `LOGOUT`.
- **탈퇴**: 비밀번호 재확인 실패 → 401, 아무것도 삭제하지 않음. 성공 → `DELETE FROM users WHERE id = $1`(나머지는 CASCADE). 탈퇴 이벤트는 따로 남기지 않는다(NFR-14).
- 모든 auth_events에 `platform`(요청 헤더), `ip`(`request.ip`), `user_agent`(헤더, 최대 300자)를 기록.
- 비밀번호·토큰 원문은 어디에도 기록하지 않는다.

## 5. 앱

### 5.1 컴포넌트
- `TextField`(label, value, onChangeText, error?, help?, secure? → 보기/숨기기 토글, autoCapitalize="none", autoCorrect=false, accessibilityLabel)
- `Button`(variant: primary | secondary | danger, loading → 비활성 + "처리 중…")
- `FormMessage`(tone: error | success)
- `ConfirmModal`(RN `Modal` 기반, iOS·Web 동일 동작; `Alert`는 Web 미지원이라 사용하지 않음)

### 5.2 인증 상태 (`AuthProvider` 확장)
- 상태: `loading | signedOut | signedIn(user) | unreachable`
- 시작: 토큰 없음 → signedOut. 토큰 있음 → `GET /me` → 성공 signedIn / 401 토큰 삭제 후 signedOut / `NETWORK_ERROR`·`TIMEOUT` → unreachable("서버에 연결할 수 없어요" + 다시 시도).
- `signIn(auth: AuthResponse)`: 토큰 저장 → 상태 signedIn.
- `signOut()`: 메모리 토큰·상태를 먼저 비우고 → `clearToken`(try/catch) → `POST /auth/logout`(실패 무시, 토큰은 요청 직전에 캡처).
- `setUser(user)`: 닉네임 수정 결과 반영.
- 401(토큰 보유 상태)은 전역 핸들러가 `signOut` 로컬 처리.
- 라우트 가드: signedIn → `(main)`, 그 외 → `(auth)`. unreachable 상태는 루트에서 재시도 화면을 렌더.

### 5.3 API 클라이언트 보강
- 요청 타임아웃 10초(AbortController) → `ApiError('TIMEOUT', '서버 응답이 늦어요. 잠시 후 다시 시도해주세요.', 0)`.
- 서버는 모든 성공 응답에 JSON 본문을 보낸다(204 미사용).

### 5.4 화면
| 화면 | 내용 |
|---|---|
| `(auth)/login` | 아이디·비밀번호(토글)·로그인 버튼·회원가입 링크. 실패 시 `FormMessage`, 입력값 유지. 개발 모드(`__DEV__`)에서만 하단에 `ServerStatus` |
| `(auth)/signup` | 아이디·비밀번호(토글, 규칙 도움말 상시 표시)·닉네임·가입 버튼·로그인 링크. 제출 시 shared 스키마로 먼저 검사해 칸별 오류 표시, `LOGIN_ID_TAKEN`은 아이디 칸 오류로 |
| `(main)/index` | "{닉네임}님 오늘도 한 잎을 남겨볼까요?" (나머지 4단계) |
| `(main)/profile` | 아이디(읽기 전용), 닉네임 입력+저장(성공 시 "닉네임을 바꿨어요"), 로그아웃, 회원탈퇴 → `ConfirmModal`("일기·코인·식물·정원 기록이 모두 삭제되며 되돌릴 수 없어요" + 비밀번호 + 탈퇴하기). 성공 시 로컬 로그아웃 |

모든 폼은 iOS에서 키보드가 입력칸을 가리지 않게(`KeyboardAvoidingView`) 하고, 엔터로 다음 칸/제출. 스타일은 `theme/tokens.ts` 임시 토큰.

## 6. 테스트

- **shared 단위**: 아이디 2/3/20/21자·대문자 변환·허용 문자, 비밀번호 7/8/64/65자·대문자/숫자/특수문자 각각 누락·공백, 닉네임 공백만·한글 10/11자.
- **server 통합**(`haruleaf_test`, `app.inject`):
  - 가입: 201 + 토큰, 초기 5종 INITIAL, SIGNUP 이벤트(platform 기록), 비밀번호 해시 형식(`scrypt$`)·원문 미포함, 대문자 아이디 소문자 저장, 중복 409, 동시 가입 2건 → 1건 201·1건 409, 규칙 위반 400 한국어 메시지.
  - 로그인: 성공 + LOGIN_SUCCESS, 틀린 비밀번호·없는 아이디 동일 응답, LOGIN_FAILED(없는 아이디는 user_id NULL, 40자 입력은 30자로 저장).
  - 세션: 토큰 없음/잘못됨/로그아웃됨/만료됨 → 401, 두 기기 세션 중 하나 로그아웃해도 다른 쪽 유지, 다른 사용자 데이터 접근 불가.
  - 내 정보: GET/PATCH, 닉네임 규칙 위반 400.
  - 탈퇴: 틀린 비밀번호 401 + 데이터 보존, 성공 시 users·user_credentials·sessions·user_plants·해당 auth_events 0건, 이후 토큰 401, 같은 아이디로 재가입 가능.
  - 선행 작업: 민감 파라미터가 로그에 없음, zod 단일 사본, global-setup의 `_test` 가드.
- **app**: typecheck, lint.
- **수동(교차 기기)**: iOS 시뮬레이터 가입 → Web 로그인 시 같은 닉네임 → Web에서 닉네임 변경 → iOS 앱 재실행 시 반영 → 로그아웃 → 탈퇴 후 재로그인 불가 → `auth_events`에 ios/web 기록 확인.

## 7. 완료 기준

1. `npm test`, `npm run typecheck`, `npm run lint` 통과.
2. 6절 수동 교차 기기 시나리오 통과.
3. 서버 로그에 비밀번호·토큰·해시가 나타나지 않음(가입·로그인·탈퇴 수행 후 로그 검색).
