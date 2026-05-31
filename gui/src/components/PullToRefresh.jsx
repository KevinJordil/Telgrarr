import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';

export default function PullToRefresh({ children, className = '' }) {
  const [pullY, setPullY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startX = useRef(0);
  const startY = useRef(0);
  const isTracking = useRef(false);
  const isPulling = useRef(false);
  const gestureLocked = useRef(false);
  const scrollRef = useRef(null);

  const THRESHOLD = 80;
  const MAX_PULL = 150;
  const LOCKED_Y = 60;
  const INTENT_SLOP = 10;
  const AXIS_BIAS = 8;

  const resetGesture = () => {
    isTracking.current = false;
    isPulling.current = false;
    gestureLocked.current = false;
  };

  const handleTouchStart = (e) => {
    const el = scrollRef.current;
    if (!el || isRefreshing) return;

    if (el.scrollTop <= 0) {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      isTracking.current = true;
      isPulling.current = false;
      gestureLocked.current = false;
    } else {
      resetGesture();
      setPullY(0);
    }
  };

  const handleTouchEnd = () => {
    if (!isTracking.current && !isPulling.current) {
      resetGesture();
      return;
    }

    if (isPulling.current && pullY >= THRESHOLD) {
      setIsRefreshing(true);
      setPullY(LOCKED_Y);
      resetGesture();
      setTimeout(() => {
        window.location.reload();
      }, 400);
      return;
    }

    resetGesture();
    setPullY(0);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const preventNative = (e) => {
      if (isRefreshing || !isTracking.current) return;

      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const deltaX = currentX - startX.current;
      const deltaY = currentY - startY.current;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (!gestureLocked.current) {
        if (absX < INTENT_SLOP && absY < INTENT_SLOP) return;

        if (deltaY > 0 && absY > absX + AXIS_BIAS && el.scrollTop <= 0) {
          gestureLocked.current = true;
          isPulling.current = true;
        } else {
          resetGesture();
          setPullY(0);
          return;
        }
      }

      if (!isPulling.current) return;

      if (deltaY > 0 && el.scrollTop <= 0) {
        const resistance = deltaY < THRESHOLD
          ? deltaY
          : THRESHOLD + (deltaY - THRESHOLD) * 0.4;

        setPullY(Math.min(resistance, MAX_PULL));

        if (e.cancelable) e.preventDefault();
      } else {
        resetGesture();
        setPullY(0);
      }
    };

    el.addEventListener('touchmove', preventNative, { passive: false });
    return () => el.removeEventListener('touchmove', preventNative);
  }, [isRefreshing]);

  return (
    <div className={`relative w-full h-full overflow-hidden bg-transparent ${className}`.trim()}>
      <div className="absolute top-0 w-full flex justify-center items-start pt-5 z-0">
        <motion.div
          animate={{
            rotate: isRefreshing ? 360 : (pullY / THRESHOLD) * 180,
          }}
          transition={
            isRefreshing
              ? { repeat: Infinity, duration: 1, ease: 'linear' }
              : { duration: 0 }
          }
          className="bg-telgrarr-surface border border-telgrarr-border shadow-md rounded-full p-2 text-telgrarr-purple"
          style={{ opacity: Math.min(pullY / (THRESHOLD * 0.8), 1) }}
        >
          <RefreshCw className="w-5 h-5" />
        </motion.div>
      </div>

      <motion.div
        ref={scrollRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        animate={{ y: isRefreshing ? LOCKED_Y : pullY }}
        transition={
          isPulling.current
            ? { duration: 0 }
            : { type: 'spring', bounce: 0.3, duration: 0.4 }
        }
        className="w-full h-full overflow-y-auto overscroll-y-none relative z-10"
      >
        {children}
      </motion.div>
    </div>
  );
}
