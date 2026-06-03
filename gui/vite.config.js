import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// DEV-ONLY. Production serves the built SPA (gui/dist) SAME-ORIGIN from the Node
// process (Express SPA fallback) — this dev server + proxy NEVER run in prod.
// Env = shell vars at `npm run dev` (dev tooling only, NOT backend config.*):
//   DEV_ALLOWED_HOSTS  comma-separated dev-server hosts (default: localhost only)
//   DEV_PROXY_TARGET   /api proxy target (default: http://localhost:<PORT|3400>)
const allowedHosts = (process.env.DEV_ALLOWED_HOSTS || '')
  .split(',').map((h) => h.trim()).filter(Boolean)
const proxyTarget = process.env.DEV_PROXY_TARGET
  || `http://localhost:${process.env.PORT || '3400'}`

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
      }
    }
  }
})
