import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // 테스트 DB 하나를 공유하므로 파일을 순차 실행한다.
    fileParallelism: false,
  },
});
