import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Vitest uses this file instead of vite.config.ts when both exist,
// so the React plugin has to be repeated here.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
