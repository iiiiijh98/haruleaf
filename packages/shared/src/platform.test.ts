import { describe, expect, it } from 'vitest';
import { PLATFORM_HEADER, platformSchema } from './platform';

describe('platformSchema', () => {
  it('ios와 web만 허용한다', () => {
    expect(platformSchema.parse('ios')).toBe('ios');
    expect(platformSchema.parse('web')).toBe('web');
    expect(platformSchema.safeParse('android').success).toBe(false);
    expect(platformSchema.safeParse(undefined).success).toBe(false);
  });

  it('헤더 이름은 소문자', () => {
    expect(PLATFORM_HEADER).toBe('x-client-platform');
  });
});
