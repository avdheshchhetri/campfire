import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/features/challenges/**/*.test.ts'],
  },
});
