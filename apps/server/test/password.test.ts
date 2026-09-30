import { describe, expect, it } from 'vitest';
import { dummyPasswordHash, hashPassword, verifyPassword } from '../src/lib/password';
import { createToken, hashToken } from '../src/lib/token';

describe('password', () => {
  it('scrypt 형식으로 해시하고 원문을 포함하지 않는다', async () => {
    const hash = await hashPassword('Haru123!');
    expect(hash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(hash).not.toContain('Haru123!');
  });

  it('같은 비밀번호도 salt가 달라 해시가 다르다', async () => {
    expect(await hashPassword('Haru123!')).not.toBe(await hashPassword('Haru123!'));
  });

  it('맞는 비밀번호만 통과한다', async () => {
    const hash = await hashPassword('Haru123!');
    expect(await verifyPassword('Haru123!', hash)).toBe(true);
    expect(await verifyPassword('haru123!', hash)).toBe(false);
  });

  it.each(['', 'plain', 'scrypt$zz$zz', 'bcrypt$00$00'])('잘못된 저장 형식 %j는 false', async (stored) => {
    expect(await verifyPassword('Haru123!', stored)).toBe(false);
  });

  it('더미 해시는 한 번만 만들고 어떤 비밀번호와도 일치하지 않는다', async () => {
    const first = await dummyPasswordHash();
    expect(await dummyPasswordHash()).toBe(first);
    expect(await verifyPassword('Haru123!', first)).toBe(false);
  });
});

describe('token', () => {
  it('URL 안전 43자 무작위 토큰', () => {
    const token = createToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createToken()).not.toBe(token);
  });

  it('hashToken은 결정적 sha256 hex', () => {
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashToken('abc')).toHaveLength(64);
  });
});
