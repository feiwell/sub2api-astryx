import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    maxWorkers: 4,
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
