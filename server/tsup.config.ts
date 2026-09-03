import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // better-sqlite3 is a native module: keep it external and load it from node_modules.
  external: ['better-sqlite3'],
  // Workspace packages ship TypeScript source, so they must be bundled in, not left as imports.
  noExternal: ['@app/shared'],
})
