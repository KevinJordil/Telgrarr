import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { RefreshCw } from 'lucide-react';

// Pull-to-refresh wrapper. Owns the page scroll region.
// - onRefresh: async () => void. If provided, a soft refresh is awaited (no full
//   page reload). If omitted, falls back to a hard reload (legacy behavior).
// - disabled: skip the gesture entirely (e.g. edit pages where a refresh would
//   discard in-progress input).
export default function PullToRefresh({ children, className = '', onRefresh, disabled = false }) {
  const [pullY, setPullY] = useState(0);
  const [phase, setPhase] = useState('idle'); // idle | pulling | refreshing
  const reduceMotion = useReducedMotion();

  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);
  const pulling = useRef(false);
  const locked = useRef(false);
  const scrollRef = useRef(null);

  const THRESHOLD = 80;
  const MAX_PULL = 140;
  const LOCKED_Y = 56;
  const INTENT_SLOP = 10;
  const AXIS_BIAS = 8;

  const reset = () => { tracking.current = false; pulling.current = false; locked.current = false; };

  const settle = () => { setPhase('idle'); setPullY(0); };

  const doRefresh = useCallback(async () => {
    setPhase('refreshing');
    setPullY(LOCKED_Y);
    if (!onRefresh) { window.location.reload(); return; }
    try { await onRefresh(); } catch (e) { /* swallow — settle regardless */ }
    settle();
  }, [onRefresh]);

  const onTouchStart = (e) => {
    const el = scrollRef.current;
    if (!el || disabled || phase === 'refreshing') return;
    if (el.scrollTop <= 0) {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      tracking.current = true; pulling.current = false; locked.current = false;
    } else { reset(); }
  };

  const onTouchEnd = () => {
    if (pulling.current && pullY >= THRESHOLD) { reset(); doRefresh(); return; }
    reset();
    if (phase !== 'refreshing') settle();
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onMove = (e) => {
      if (disabled || phase === 'refreshing' || !tracking.current) return;
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;
      const ax = Math.abs(dx), ay = Math.abs(dy);
      if (!locked.current) {
        if (ax < INTENT_SLOP && ay < INTENT_SLOP) return;
        if (dy > 0 && ay > ax + AXIS_BIAS && el.scrollTop <= 0) {
          locked.current = true; pulling.current = true; setPhase('pulling');
        } else { reset(); return; }
      }
      if (!pulling.current) return;
      if (dy > 0 && el.scrollTop <= 0) {
        const resist = dy < THRESHOLD ? dy : THRESHOLD + (dy - THRESHOLD) * 0.4;
        setPullY(Math.min(resist, MAX_PULL));
        if (e.cancelable) e.preventDefault();
      } else { reset(); settle(); }
    };
    el.addEventListener('touchmove', onMove, { passive: false });
    return () => el.removeEventListener('touchmove', onMove);
  }, [disabled, phase]);

  const progress = Math.min(pullY / THRESHOLD, 1);
  const spinnerActive = phase === 'refreshing' || pullY > 0;
  const spinnerY = (phase === 'refreshing' ? LOCKED_Y : pullY) - 44;

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`.trim()}>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pt-3">
        <motion.div
          initial={false}
          animate={{
            y: spinnerY,
            opacity: spinnerActive ? (phase === 'refreshing' ? 1 : progress) : 0,
            rotate: reduceMotion ? 0 : (phase === 'refreshing' ? 360 : progress * 270),
          }}
          transition={
            phase === 'refreshing' && !reduceMotion
              ? { rotate: { repeat: Infinity, duration: 0.9, ease: 'linear' }, default: { type: 'spring', stiffness: 400, damping: 32 } }
              : (phase === 'pulling' ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 32 })
          }
          className="rounded-full bg-telgrarr-surface border border-telgrarr-border shadow-card p-2 text-telgrarr-purple"
        >
          <RefreshCw className="w-5 h-5" />
        </motion.div>
      </div>

      <motion.div
        ref={scrollRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        animate={{ y: phase === 'refreshing' ? LOCKED_Y : pullY }}
        transition={phase === 'pulling' ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 36 }}
        className="w-full h-full overflow-y-auto overscroll-y-contain relative z-10"
      >
        {children}
      </motion.div>
    </div>
  );
}
