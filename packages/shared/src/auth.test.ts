import { describe, expect, it } from 'vitest';
import {
  deleteAccountSchema,
  LOGIN_ID_MESSAGE,
  loginIdSchema,
  loginSchema,
  NICKNAME_MESSAGE,
  nicknameSchema,
  PASSWORD_LENGTH_MESSAGE,
  PASSWORD_MIX_MESSAGE,
  PASSWORD_SPACE_MESSAGE,
  passwordSchema,
  signupSchema,
  updateNicknameSchema,
} from './auth';

const firstMessage = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? undefined : result.error?.issues[0]?.message;

describe('loginIdSchema', () => {
  it.each(['abc', 'haru_01', 'a'.repeat(20)])('%s 허용', (value) => {
    expect(loginIdSchema.parse(value)).toBe(value);
  });

  it('앞뒤 공백 제거 후 소문자로 바꾼다', () => {
    expect(loginIdSchema.parse('  Haru_01 ')).toBe('haru_01');
  });

  it.each(['ab', 'a'.repeat(21), 'haru-01', '하루', 'ha ru', ''])('%s 거절', (value) => {
    expect(firstMessage(loginIdSchema.safeParse(value))).toBe(LOGIN_ID_MESSAGE);
  });
});

describe('passwordSchema', () => {
  it.each(['Haru123!', 'A1!' + 'a'.repeat(61), 'ZZ99##zz'])('%s 허용', (value) => {
    expect(passwordSchema.parse(value)).toBe(value);
  });

  it.each([
    ['Ha1!abc', PASSWORD_LENGTH_MESSAGE],
    ['A1!' + 'a'.repeat(62), PASSWORD_LENGTH_MESSAGE],
    ['Haru 123!', PASSWORD_SPACE_MESSAGE],
    ['haru123!', PASSWORD_MIX_MESSAGE],
    ['HaruHaru!', PASSWORD_MIX_MESSAGE],
    ['Haru1234', PASSWORD_MIX_MESSAGE],
  ])('%s → %s', (value, message) => {
    expect(firstMessage(passwordSchema.safeParse(value))).toBe(message);
  });
});

describe('nicknameSchema', () => {
  it('앞뒤 공백을 제거한다', () => {
    expect(nicknameSchema.parse('  진화 ')).toBe('진화');
  });

  it('한글 10자는 허용, 11자는 거절', () => {
    expect(nicknameSchema.parse('가나다라마바사아자차')).toBe('가나다라마바사아자차');
    expect(firstMessage(nicknameSchema.safeParse('가나다라마바사아자차카'))).toBe(NICKNAME_MESSAGE);
  });

  it.each(['', '   '])('빈 값 %j 거절', (value) => {
    expect(firstMessage(nicknameSchema.safeParse(value))).toBe(NICKNAME_MESSAGE);
  });

  it('NUL 문자 거절', () => {
    expect(firstMessage(nicknameSchema.safeParse('진\u0000화'))).toBe('사용할 수 없는 문자가 들어 있어요.');
  });
});

describe('폼 스키마', () => {
  it('signupSchema는 세 필드를 정규화한다', () => {
    expect(signupSchema.parse({ loginId: 'Haru_01', password: 'Haru123!', nickname: ' 진화 ' })).toEqual({
      loginId: 'haru_01',
      password: 'Haru123!',
      nickname: '진화',
    });
  });

  it('signupSchema는 본문이 없으면 한국어 메시지', () => {
    expect(firstMessage(signupSchema.safeParse(undefined))).toBe('입력값을 확인해주세요.');
  });

  it('loginSchema는 형식 규칙 없이 길이만 확인하고 소문자로 바꾼다', () => {
    expect(loginSchema.parse({ loginId: ' NOBODY-X ', password: 'x' })).toEqual({ loginId: 'nobody-x', password: 'x' });
    expect(loginSchema.parse({ loginId: 'a'.repeat(100), password: 'x' }).loginId).toHaveLength(100);
    expect(firstMessage(loginSchema.safeParse({ loginId: '', password: 'x' }))).toBe('아이디를 입력해주세요.');
    expect(firstMessage(loginSchema.safeParse({ loginId: 'a'.repeat(101), password: 'x' }))).toBe('아이디를 확인해주세요.');
    expect(firstMessage(loginSchema.safeParse({ loginId: 'abc', password: '' }))).toBe('비밀번호를 입력해주세요.');
  });

  it('updateNicknameSchema와 deleteAccountSchema', () => {
    expect(updateNicknameSchema.parse({ nickname: '새이름' })).toEqual({ nickname: '새이름' });
    expect(firstMessage(deleteAccountSchema.safeParse({ password: '' }))).toBe('비밀번호를 입력해주세요.');
  });
});
