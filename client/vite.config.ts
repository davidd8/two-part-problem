import http from 'node:http'
import { fileURLToPath } from 'node:url'
import type { ServerResponse } from 'node:http'
import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import type { ApiError } from '@app/shared'

/** Mirrors BASE_PORTS in server/src/env.ts — see the comment there. */
const BASE_WEB_PORT = 5173
const BASE_API_PORT = 3001

/** How long an /api request waits for the API to answer before giving up. */
const READY_TIMEOUT_MS = 10_000

/**
 * Resolves once the API is actually serving. This asks /api/health rather than
 * opening a bare socket: a raw connect only proves something holds the port,
 * and it leaves a connected-but-silent socket behind, which is precisely what
 * stops the server's own `server.close()` from ever completing.
 */
function probeApi(target: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      `${target}/api/health`,
      { method: 'GET', timeout: 500, agent: false, headers: { Connection: 'close' } },
      (res) => {
        res.resume()
        resolve(res.statusCode === 200)
      },
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
    req.end()
  })
}

/** The ApiError the client already knows how to render, not a proxy stack trace. */
function respondUnavailable(res: ServerResponse, target: string) {
  if (res.headersSent) return
  const body: ApiError = {
    error: {
      message: `The API at ${target} is not reachable — is it still running?`,
      code: 'api_unavailable',
    },
  }
  res.statusCode = 503
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/**
 * Vite boots in milliseconds; the API needs a second for tsx and the native
 * sqlite binding, and `tsx watch` restarts it on every server edit. A request
 * landing in either window used to hit a closed port, which surfaced as an
 * ECONNREFUSED stack trace in the terminal and a 500 in the browser. Hold
 * /api requests at the door until the port answers, so the gap is invisible.
 */
function apiReadyGate(target: string): Plugin {
  return {
    name: 'api-ready-gate',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api')) {
          next()
          return
        }

        void (async () => {
          if (await probeApi(target)) {
            next()
            return
          }

          server.config.logger.info(`  ➜  waiting for the API on ${target} …`)
          const deadline = Date.now() + READY_TIMEOUT_MS
          while (Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 150))
            if (await probeApi(target)) {
              next()
              return
            }
          }
          respondUnavailable(res, target)
        })()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // The root .env is the server's, not the client's — read it only for the port
  // offset. Nothing here reaches the browser bundle; that still needs VITE_*.
  const repoRoot = fileURLToPath(new URL('..', import.meta.url))
  const offset = Number(loadEnv(mode, repoRoot, '').PORT_OFFSET ?? 0)
  const apiTarget = process.env.API_TARGET ?? `http://localhost:${BASE_API_PORT + offset}`

  return {
    plugins: [react(), apiReadyGate(apiTarget)],
    server: {
      port: BASE_WEB_PORT + offset,
      // Fail loudly on a clash instead of sliding onto the next port — which is
      // the e2e web port, and would quietly proxy to another clone's API.
      strictPort: true,
      // Everything under /api goes to the Express server, so the browser sees one origin.
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          configure(proxy) {
            // Backstop: the API can still drop between the probe and the proxied
            // request. Answer in the shared error shape rather than a raw 500.
            proxy.on('error', (err, _req, res) => {
              console.warn(`[api proxy] ${err.message}`)
              if ('writeHead' in res) respondUnavailable(res, apiTarget)
            })
          },
        },
      },
      // Allow importing the shared workspace package from outside client/.
      fs: { allow: ['..'] },
    },
    build: { outDir: 'dist', sourcemap: true },
  }
})
