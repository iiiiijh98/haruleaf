import type { AuthResponse, LoginInput, SignupInput, User } from '@haruleaf/shared';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { authEvents, plants, sessions, userCredentials, userPlants, users } from '../db/schema';
import { isUniqueViolation } from '../lib/db-errors';
import { AppError, unauthorized } from '../lib/errors';
import { dummyPasswordHash, hashPassword, verifyPassword } from '../lib/password';
import type { ClientMeta } from '../lib/request-meta';
import { createToken, hashToken } from '../lib/token';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EVENT_LOGIN_ID_MAX = 30;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;
type AuthEvent = 'SIGNUP' | 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'LOGOUT';

export type AuthContext = { userId: string; sessionId: string; loginId: string };

export function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    loginId: row.loginId,
    nickname: row.nickname,
    coinBalance: row.coinBalance,
    createdAt: row.createdAt.toISOString(),
  };
}

async function issueSession(tx: Executor, userId: string, meta: ClientMeta, now: Date): Promise<string> {
  const token = createToken();
  await tx.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    platform: meta.platform,
    createdAt: now,
    lastUsedAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  });
  return token;
}

async function recordEvent(tx: Executor, event: AuthEvent, loginId: string, userId: string | null, meta: ClientMeta) {
  await tx.insert(authEvents).values({
    userId,
    loginId: loginId.slice(0, EVENT_LOGIN_ID_MAX),
    event,
    platform: meta.platform,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

export async function signup(db: Db, input: SignupInput, meta: ClientMeta, now = new Date()): Promise<AuthResponse> {
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ loginId: input.loginId, nickname: input.nickname, createdAt: now, updatedAt: now })
        .returning();
      if (!user) throw new Error('사용자 생성 결과가 비어 있습니다.');
      await tx.insert(userCredentials).values({ userId: user.id, passwordHash, updatedAt: now });
      const initialPlants = await tx
        .select({ id: plants.id })
        .from(plants)
        .where(and(eq(plants.initialFree, true), eq(plants.isActive, true)));
      if (initialPlants.length > 0) {
        await tx
          .insert(userPlants)
          .values(initialPlants.map((plant) => ({ userId: user.id, plantId: plant.id, unlockSource: 'INITIAL', unlockedAt: now })));
      }
      const token = await issueSession(tx, user.id, meta, now);
      await recordEvent(tx, 'SIGNUP', user.loginId, user.id, meta);
      return { token, user: toUser(user) };
    });
  } catch (error) {
    if (isUniqueViolation(error, 'users_login_id_unique')) throw new AppError('LOGIN_ID_TAKEN', '이미 사용 중인 아이디입니다.', 409);
    throw error;
  }
}

export async function login(db: Db, input: LoginInput, meta: ClientMeta, now = new Date()): Promise<AuthResponse> {
  const [row] = await db
    .select({ user: users, passwordHash: userCredentials.passwordHash })
    .from(users)
    .innerJoin(userCredentials, eq(userCredentials.userId, users.id))
    .where(eq(users.loginId, input.loginId))
    .limit(1);
  const valid = await verifyPassword(input.password, row?.passwordHash ?? (await dummyPasswordHash()));
  if (!row || !valid) {
    await recordEvent(db, 'LOGIN_FAILED', input.loginId, row?.user.id ?? null, meta);
    throw new AppError('INVALID_CREDENTIALS', '아이디 또는 비밀번호가 올바르지 않습니다.', 401);
  }
  return db.transaction(async (tx) => {
    const token = await issueSession(tx, row.user.id, meta, now);
    await recordEvent(tx, 'LOGIN_SUCCESS', row.user.loginId, row.user.id, meta);
    return { token, user: toUser(row.user) };
  });
}

/** 세션 사용 시각은 이 간격이 지났을 때만 갱신한다(요청마다 DB 쓰기 방지). */
export const LAST_USED_REFRESH_MS = 5 * 60 * 1000;

export async function authenticate(db: Db, token: string, now = new Date()): Promise<AuthContext | null> {
  const [row] = await db
    .select({ sessionId: sessions.id, userId: users.id, loginId: users.loginId, lastUsedAt: sessions.lastUsedAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row) return null;
  if (now.getTime() - row.lastUsedAt.getTime() >= LAST_USED_REFRESH_MS) {
    await db.update(sessions).set({ lastUsedAt: now }).where(eq(sessions.id, row.sessionId));
  }
  return { sessionId: row.sessionId, userId: row.userId, loginId: row.loginId };
}

export async function logout(db: Db, auth: AuthContext, meta: ClientMeta, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, auth.sessionId));
    await recordEvent(tx, 'LOGOUT', auth.loginId, auth.userId, meta);
  });
}

export async function getUser(db: Db, userId: string): Promise<User> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) throw unauthorized();
  return toUser(row);
}

export async function updateNickname(db: Db, userId: string, nickname: string, now = new Date()): Promise<User> {
  const [row] = await db.update(users).set({ nickname, updatedAt: now }).where(eq(users.id, userId)).returning();
  if (!row) throw unauthorized();
  return toUser(row);
}

/** 비밀번호 재확인 후 계정을 지운다. 연결된 데이터는 FK CASCADE로 함께 삭제된다. */
export async function deleteAccount(db: Db, userId: string, password: string): Promise<void> {
  const [credential] = await db
    .select({ passwordHash: userCredentials.passwordHash })
    .from(userCredentials)
    .where(eq(userCredentials.userId, userId))
    .limit(1);
  if (!credential) throw unauthorized();
  if (!(await verifyPassword(password, credential.passwordHash))) {
    throw new AppError('INVALID_PASSWORD', '비밀번호가 올바르지 않습니다.', 401);
  }
  await db.delete(users).where(eq(users.id, userId));
}
