import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { host: true, port: 5173 },
  preview: { port: 4173 },
  test: {
    include: ['src/core/**/*.test.ts', 'src/tactics/**/*.test.ts', 'src/battle/**/*.test.ts'],
  },
});
