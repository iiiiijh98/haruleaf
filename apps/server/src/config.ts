import { z } from 'zod';

export const DEFAULT_DATABASE_URL = 'postgres://haruleaf:haruleaf@localhost:5433/haruleaf';

const isValidTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).default(DEFAULT_DATABASE_URL),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:8081'),
  ATTENDANCE_COINS: z.coerce.number().int().positive().default(5),
  TZ_NAME: z.string().refine(isValidTimeZone, '알 수 없는 시간대').default('Asia/Seoul'),
});

export type Config = {
  databaseUrl: string;
  host: string;
  port: number;
  corsOrigins: string[];
  attendanceCoins: number;
  timeZone: string;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
    throw new Error(`환경변수 설정이 올바르지 않습니다: ${detail}`);
  }
  const value = parsed.data;
  return {
    databaseUrl: value.DATABASE_URL,
    host: value.HOST,
    port: value.PORT,
    corsOrigins: value.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    attendanceCoins: value.ATTENDANCE_COINS,
    timeZone: value.TZ_NAME,
  };
}
