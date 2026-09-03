import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API_TARGET = process.env.API_TARGET ?? 'http://localhost:3001'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Everything under /api goes to the Express server, so the browser sees one origin.
    proxy: { '/api': { target: API_TARGET, changeOrigin: true } },
    // Allow importing the shared workspace package from outside client/.
    fs: { allow: ['..'] },
  },
  build: { outDir: 'dist', sourcemap: true },
})
