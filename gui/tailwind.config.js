/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        telgrarr: {
          black: 'rgb(var(--color-bg) / <alpha-value>)',
          surface: 'rgb(var(--color-surface) / <alpha-value>)',
          border: 'rgb(var(--color-border) / <alpha-value>)',
          text: 'rgb(var(--color-text) / <alpha-value>)',
          muted: 'rgb(var(--color-muted) / <alpha-value>)',
          elevated: 'rgb(var(--color-elevated) / <alpha-value>)',
          'on-accent': 'rgb(var(--color-on-accent) / <alpha-value>)',
          success: 'rgb(var(--color-success) / <alpha-value>)',
          warning: 'rgb(var(--color-warning) / <alpha-value>)',
          danger: 'rgb(var(--color-danger) / <alpha-value>)',
          purple: {
            DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
            glow: 'rgb(var(--color-accent-glow) / <alpha-value>)',
            dark: 'rgb(var(--color-accent-dark) / <alpha-value>)',
          },
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glass': 'var(--shadow-glass)',
        'card': 'var(--shadow-card)',
      },
      animation: {
        'spin-slow': 'spin 8s linear infinite',
      },
      transitionDuration: {
        'fast': 'var(--motion-fast)',
        'base': 'var(--motion-base)',
        'slow': 'var(--motion-slow)',
      },
      transitionTimingFunction: {
        'standard': 'var(--ease-standard)',
        'emphasized': 'var(--ease-emphasized)',
      }
    },
  },
  plugins: [],
}
