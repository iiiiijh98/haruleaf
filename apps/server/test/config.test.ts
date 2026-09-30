import { describe, expect, it } from 'vitest';
import { DEFAULT_DATABASE_URL, loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('값이 없으면 기본값을 쓴다', () => {
    expect(loadConfig({})).toEqual({
      databaseUrl: DEFAULT_DATABASE_URL,
      host: '0.0.0.0',
      port: 4000,
      corsOrigins: ['http://localhost:8081'],
      attendanceCoins: 5,
      timeZone: 'Asia/Seoul',
    });
  });

  it('CORS_ORIGINS는 쉼표로 나누고 공백·빈 값을 제거한다', () => {
    const config = loadConfig({ CORS_ORIGINS: 'http://localhost:8081, http://192.168.0.5:8081,' });
    expect(config.corsOrigins).toEqual(['http://localhost:8081', 'http://192.168.0.5:8081']);
  });

  it('숫자 환경변수를 변환한다', () => {
    const config = loadConfig({ PORT: '4100', ATTENDANCE_COINS: '7' });
    expect(config.port).toBe(4100);
    expect(config.attendanceCoins).toBe(7);
  });

  it.each([
    [{ PORT: 'abc' }],
    [{ ATTENDANCE_COINS: '0' }],
    [{ TZ_NAME: 'Not/AZone' }],
  ])('잘못된 값 %j는 오류', (env) => {
    expect(() => loadConfig(env)).toThrow('환경변수 설정이 올바르지 않습니다');
  });
});
