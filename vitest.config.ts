import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    maxWorkers: 4,
    // jsdom + heavy CSS parsing makes the DOM-heavy page tests (KeysPage,
    // AdminSettingsPage, AccountUsageCell) take 3-25s each. With four workers on
    // a busy machine the default 5s times them out even though they pass in
    // isolation, so allow more headroom.
    testTimeout: 30000,
    hookTimeout: 30000,
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'https://app.example.test/' } },
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}', 'shared/**/*.ts'],
      exclude: ['src/test/**', '**/*.d.ts', '**/*.{spec,test}.{ts,tsx}'],
    },
  },
})
