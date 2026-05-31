import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: [
      'telgrarr.ifahad.net'
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:3400',
        changeOrigin: true,
      }
    }
  }
})
