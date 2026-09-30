import { createHash, randomBytes } from 'node:crypto';

/** 세션 토큰 원문(기기에만 보관). */
export function createToken(): string {
  return randomBytes(32).toString('base64url');
}

/** DB에는 토큰의 SHA-256 해시만 저장한다. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
