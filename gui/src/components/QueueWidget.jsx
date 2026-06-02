import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, X } from 'lucide-react';

function useCountdown(expiresAt) {
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    if (!expiresAt) { setRemaining(null); return; }
    function tick() {
      const diff = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      setRemaining(diff);
    }
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [expiresAt]);

  return remaining;
}

export default function QueueWidget({ queueState }) {
  const { active, expiresAt } = queueState;
  const remaining = useCountdown(expiresAt);
  const [flushing, setFlushing] = useState(false);

  const totalMs  = 300000; // 5 min default — visual only
  const progress = remaining !== null ? Math.max(0, Math.min(1, remaining / totalMs)) : 1;
  const secs     = remaining !== null ? Math.ceil(remaining / 1000) : 0;
  const mins     = Math.floor(secs / 60);
  const secsLeft = secs % 60;
  const label    = mins > 0
    ? mins + 'm ' + String(secsLeft).padStart(2, '0') + 's'
    : secs + 's';

  const circumference = 2 * Math.PI * 20;
  const dash = circumference * (1 - progress);

  async function handleFlush() {
    setFlushing(true);
    try {
      await fetch('/api/queue/flush', { method: 'POST' });
    } catch (_) {}
    setTimeout(() => setFlushing(false), 1500);
  }

  async function handleClear() {
    try {
      await fetch('/api/queue/clear', { method: 'POST' });
    } catch (_) {}
  }

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="relative z-10 mb-6 mx-1"
        >
          <div className="bg-telgrarr-surface border border-telgrarr-purple/30 rounded-2xl p-4 shadow-[0_0_24px_rgba(139,92,246,0.12)] flex items-center gap-4">
            {/* SVG ring countdown */}
            <div className="relative flex-none w-12 h-12">
              <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(139,92,246,0.15)" strokeWidth="3.5" />
                <circle
                  cx="24" cy="24" r="20" fill="none"
                  stroke="#8b5cf6" strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dash}
                  style={{ transition: 'stroke-dashoffset 0.5s linear' }}
                />
              </svg>
              <Zap className="absolute inset-0 m-auto w-4 h-4 text-telgrarr-purple" />
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-telgrarr-muted font-medium tracking-wide uppercase mb-0.5">Batch in Queue</p>
              <p className="text-telgrarr-text font-semibold text-sm">
                Sending in <span className="text-telgrarr-purple tabular-nums">{label}</span>
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-none">
              <button
                onClick={handleFlush}
                disabled={flushing}
                className="text-xs bg-telgrarr-purple/20 hover:bg-telgrarr-purple/40 text-telgrarr-purple border border-telgrarr-purple/30 px-3 py-1.5 rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50"
              >
                {flushing ? '...' : 'Send Now'}
              </button>
              <button
                onClick={handleClear}
                className="p-1.5 text-telgrarr-muted hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10 active:scale-95"
                aria-label="Discard queue"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
