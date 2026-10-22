import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Project pages live at /ascii-rpg-proto/. Local dev stays at /.
  base: process.env.GITHUB_ACTIONS ? '/ascii-rpg-proto/' : '/',
  server: { host: true, port: 5173 },
  preview: { port: 4173 },
  build: { rollupOptions: { input: ['index.html', 'battle.html'] } },
  test: {
    include: ['src/core/**/*.test.ts', 'src/tactics/**/*.test.ts', 'src/battle/**/*.test.ts', 'src/pixels.test.ts'],
  },
});
