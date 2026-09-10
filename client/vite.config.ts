import net from 'node:net'
import type { ServerResponse } from 'node:http'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import type { ApiError } from '@app/shared'

const API_TARGET = process.env.API_TARGET ?? 'http://localhost:3001'
const { hostname: API_HOST, port: API_PORT } = new URL(API_TARGET)

/** How long an /api request waits for the API to answer before giving up. */
const READY_TIMEOUT_MS = 10_000

/** Resolves once something is listening on the API port. */
function probeApi(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: API_HOST, port: Number(API_PORT) })
    const settle = (reachable: boolean) => {
      socket.destroy()
      resolve(reachable)
    }
    socket.setTimeout(500)
    socket.on('connect', () => settle(true))
    socket.on('error', () => settle(false))
    socket.on('timeout', () => settle(false))
  })
}

/** The ApiError the client already knows how to render, not a proxy stack trace. */
function respondUnavailable(res: ServerResponse) {
  if (res.headersSent) return
  const body: ApiError = {
    error: {
      message: `The API at ${API_TARGET} is not reachable — is it still running?`,
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
function apiReadyGate(): Plugin {
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
          if (await probeApi()) {
            next()
            return
          }

          server.config.logger.info(`  ➜  waiting for the API on ${API_TARGET} …`)
          const deadline = Date.now() + READY_TIMEOUT_MS
          while (Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 150))
            if (await probeApi()) {
              next()
              return
            }
          }
          respondUnavailable(res)
        })()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), apiReadyGate()],
  server: {
    port: 5173,
    // Everything under /api goes to the Express server, so the browser sees one origin.
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        configure(proxy) {
          // Backstop: the API can still drop between the probe and the proxied
          // request. Answer in the shared error shape rather than a raw 500.
          proxy.on('error', (err, _req, res) => {
            console.warn(`[api proxy] ${err.message}`)
            if ('writeHead' in res) respondUnavailable(res)
          })
        },
      },
    },
    // Allow importing the shared workspace package from outside client/.
    fs: { allow: ['..'] },
  },
  build: { outDir: 'dist', sourcemap: true },
})
