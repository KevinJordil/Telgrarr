import React from 'react';
import { motion } from 'framer-motion';

export default function LoginBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 transition-colors duration-700 bg-telgrarr-black">
      <svg
        className="absolute inset-0 w-full h-full"
        aria-hidden="true"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern
            id="telegram-pattern"
            x="0"
            y="0"
            width="220"
            height="220"
            patternUnits="userSpaceOnUse"
          >
            <g
              fill="none"
              stroke="rgb(var(--color-muted) / 0.20)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M40 42l40-18-18 40-10-15-12-7z" />
              <path d="M138 36h20a8 8 0 0 1 8 8v8a8 8 0 0 1-8 8h-9l-7 7v-7h-4a8 8 0 0 1-8-8v-8a8 8 0 0 1 8-8z" />
              <path d="M146 142c8-10 18-10 26 0" />
              <path d="M139 154c12-14 30-14 42 0" />
              <path d="M34 150l8-8 8 8 8-8 8 8" />
              <path d="M156 92l4 8 8 4-8 4-4 8-4-8-8-4 8-4z" />
              <circle cx="74" cy="108" r="4" />
            </g>

            <g fill="rgb(var(--color-accent) / 0.20)">
              <circle cx="108" cy="54" r="3.5" />
              <circle cx="180" cy="152" r="2.5" />
              <circle cx="24" cy="110" r="2.5" />
            </g>
          </pattern>
        </defs>

        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="url(#telegram-pattern)"
          className="opacity-75"
        />
      </svg>

      <div className="absolute inset-0 bg-gradient-to-b from-telgrarr-surface/35 via-telgrarr-black/10 to-telgrarr-black/45" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--tw-gradient-stops))] from-transparent via-telgrarr-black/20 to-telgrarr-black/35" />

      <motion.div
        animate={{
          scale: [1, 1.12, 1],
          opacity: [0.10, 0.18, 0.10],
          rotate: [0, 50, 0],
        }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -top-1/4 -left-1/4 w-3/4 h-3/4 md:w-1/2 md:h-1/2 rounded-full bg-telgrarr-purple/20 blur-3xl"
      />

      <motion.div
        animate={{
          scale: [1, 1.22, 1],
          opacity: [0.08, 0.16, 0.08],
          x: [0, 28, 0],
          y: [0, -28, 0],
        }}
        transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        className="absolute -bottom-1/4 -right-1/4 w-3/4 h-3/4 md:w-1/2 md:h-1/2 rounded-full bg-telgrarr-purple-glow/20 blur-3xl"
      />

      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1/2 md:h-2/3 bg-telgrarr-black/25 blur-3xl" />
    </div>
  );
}
