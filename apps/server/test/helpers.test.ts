import { describe, expect, it } from 'vitest';
import { assertTestDatabase } from './helpers';

describe('assertTestDatabase', () => {
  it('_test로 끝나는 DB만 허용한다', () => {
    expect(() => assertTestDatabase('postgres://u:p@localhost:5433/haruleaf_test')).not.toThrow();
    expect(() => assertTestDatabase('postgres://u:p@localhost:5433/haruleaf')).toThrow('_test');
  });

  it('오류 메시지에 비밀번호를 드러내지 않는다', () => {
    expect(() => assertTestDatabase('postgres://u:topsecret@localhost:5433/haruleaf')).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('topsecret') }),
    );
  });
});
