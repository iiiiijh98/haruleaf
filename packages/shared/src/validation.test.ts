import { describe, expect, it } from 'vitest';
import { signupSchema } from './auth';
import { firstIssueByField } from './validation';

describe('firstIssueByField', () => {
  it('필드별 첫 오류 메시지만 모은다', () => {
    const result = signupSchema.safeParse({ loginId: 'ab', password: 'short', nickname: '' });
    expect(result.success).toBe(false);
    expect(firstIssueByField(result.error!)).toEqual({
      loginId: '아이디는 영문 소문자·숫자·_ 3~20자로 입력해주세요.',
      password: '비밀번호는 8~64자로 입력해주세요.',
      nickname: '닉네임은 1~10자로 입력해주세요.',
    });
  });

  it('경로가 없는 오류는 건너뛴다', () => {
    expect(firstIssueByField({ issues: [{ path: [], message: 'x' }] })).toEqual({});
  });
});
