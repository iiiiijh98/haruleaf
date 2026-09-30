import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { platformSchema, z } from '@haruleaf/shared';
import { describe, expect, it } from 'vitest';

const serverDir = fileURLToPath(new URL('..', import.meta.url));

describe('zod 단일 인스턴스', () => {
  it('서버는 zod를 직접 의존하지 않는다', () => {
    const pkg = JSON.parse(readFileSync(`${serverDir}/package.json`, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.zod).toBeUndefined();
    expect(pkg.devDependencies?.zod).toBeUndefined();
    expect(existsSync(`${serverDir}/node_modules/zod`)).toBe(false);
  });

  it('shared 스키마의 오류는 shared가 내보낸 z.ZodError 인스턴스다', () => {
    const result = platformSchema.safeParse('android');
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(z.ZodError);
  });
});
