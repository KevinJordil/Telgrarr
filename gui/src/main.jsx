import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'

// Self-heal stale lazy-loaded chunks. After a redeploy the build hashes change,
// so a tab still running the previous entry bundle requests an old chunk hash,
// which the server now 404s (src/utils/spa-fallback.js). Vite raises a cancelable
// 'vite:preloadError' for that failed dynamic import; we reload ONCE to pull the
// fresh entry. A sessionStorage timestamp guards against an infinite reload loop:
// if a preload still fails within RELOAD_WINDOW_MS of our last reload, the server
// genuinely cannot serve the chunk, so we stop and let the rejection fall through
// to <ErrorBoundary> (its Reload button is the manual fallback). sessionStorage
// survives the reload (so the guard holds) but clears when the tab closes (so a
// later visit heals fresh). If storage is unavailable we do nothing and defer to
// <ErrorBoundary> -- a visible error beats a reload loop.
function installChunkReloadGuard() {
  const KEY = 'telgrarr_chunkReloadAt'
  const RELOAD_WINDOW_MS = 10000
  window.addEventListener('vite:preloadError', (event) => {
    let last
    try {
      last = Number(sessionStorage.getItem(KEY)) || 0
    } catch {
      return
    }
    const now = Date.now()
    if (now - last < RELOAD_WINDOW_MS) return
    try {
      sessionStorage.setItem(KEY, String(now))
    } catch {
      return
    }
    event.preventDefault()
    console.warn('[telgrarr] Stale app chunk detected, reloading to update.')
    window.location.reload()
  })
}

installChunkReloadGuard()

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <React.StrictMode>
      <App />
    </React.StrictMode>
  </ErrorBoundary>,
)

