import React from 'react'

/**
 * Top-level React error boundary (F.3 / M3).
 *
 * Catches uncaught errors thrown during the render of any descendant
 * component and shows a minimal fallback UI in place of the default
 * white-screen crash.
 *
 * SCOPE — what this boundary catches (per React contract):
 *   ✓ Render-time errors in any descendant
 * NOT caught (out of F.3 scope; needs separate handling):
 *   ✗ Errors in event handlers (use try/catch at the call site)
 *   ✗ Errors in async code (use .catch / window error listeners)
 *   ✗ Errors during server-side rendering
 *   ✗ Errors thrown in the boundary itself
 *
 * Error boundaries MUST be class components — React's API contract.
 * Reset is via a full page reload, which re-runs bootstrap (theme init,
 * auth check, SSE) and clears any in-memory state.
 *
 * Styling note: kept intentionally neutral (Tailwind utilities only — no
 * brand colors, no hardcoded px/hex per R15). The structural component
 * is the value-add; the Architect can theme it to match the rest of the
 * app's design language later without touching the boundary's logic.
 *
 * Fallback rendering is deliberately dependency-free (no hooks, no
 * contexts, no async) so it can render even when the rest of the app
 * is broken.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // Frontend telemetry is a separate concern (no backend POST here — out
    // of F.3 scope). console.error surfaces in DevTools and in any
    // user-reported screenshot.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] uncaught render error:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const message = this.state.error && this.state.error.message
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-white dark:bg-gray-900">
        <div className="max-w-md w-full text-center">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Something went wrong
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            The app hit an unexpected error and could not continue. Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex items-center px-4 py-2 rounded-md bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-gray-200 text-white dark:text-gray-900 text-sm font-medium transition-colors"
          >
            Reload
          </button>
          {message && (
            <details className="mt-6 text-left text-xs text-gray-500 dark:text-gray-500">
              <summary className="cursor-pointer">Error details</summary>
              <pre className="mt-2 whitespace-pre-wrap break-all">{String(message)}</pre>
            </details>
          )}
        </div>
      </div>
    )
  }
}
