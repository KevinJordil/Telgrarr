import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Activity, Wifi, WifiOff } from 'lucide-react';
import EVENT_TYPES from '@shared/events.json';

// Theme-aware semantic palette (5 buckets) — replaces the non-theme raw Tailwind palette hues.
const OK      = { color: 'text-telgrarr-success', bg: 'bg-telgrarr-success/10', dot: 'bg-telgrarr-success' };
const ERR     = { color: 'text-telgrarr-danger',  bg: 'bg-telgrarr-danger/10',  dot: 'bg-telgrarr-danger'  };
const WARN    = { color: 'text-telgrarr-warning', bg: 'bg-telgrarr-warning/10', dot: 'bg-telgrarr-warning' };
const ACCENT  = { color: 'text-telgrarr-purple',  bg: 'bg-telgrarr-purple/10',  dot: 'bg-telgrarr-purple'  };
const NEUTRAL = { color: 'text-telgrarr-muted',   bg: 'bg-telgrarr-muted/10',   dot: 'bg-telgrarr-muted'   };

const TYPE_CONFIG = {
  [EVENT_TYPES.QUEUE_ITEM_ADDED]:    ACCENT,
  [EVENT_TYPES.QUEUE_TIMER_STARTED]: ACCENT,
  [EVENT_TYPES.QUEUE_FLUSH]:         ACCENT,
  [EVENT_TYPES.QUEUE_CLEARED]:       WARN,
  [EVENT_TYPES.QUEUE_DRAINED]:       NEUTRAL,
  [EVENT_TYPES.SWEEP_STARTED]:       ACCENT,
  [EVENT_TYPES.SWEEP_ITEM_READY]:    ACCENT,
  [EVENT_TYPES.SWEEP_TG_SENT]:       OK,
  [EVENT_TYPES.SWEEP_COMPLETE]:      OK,
  [EVENT_TYPES.SWEEP_TG_ERROR]:      ERR,
  [EVENT_TYPES.SWEEP_ERROR]:         ERR,
  [EVENT_TYPES.SWEEP_EMBY]:          ACCENT,
  [EVENT_TYPES.AUTH_LOGIN_SUCCESS]:  OK,
  [EVENT_TYPES.AUTH_LOGIN_FAILED]:   ERR,
  [EVENT_TYPES.AUTH_PW_CHANGED]:     WARN,
  [EVENT_TYPES.SETTINGS_SAVED]:      OK,
  [EVENT_TYPES.SETTINGS_RESTART]:    WARN,
  [EVENT_TYPES.LOG_WARN]:            WARN,
  [EVENT_TYPES.LOG_ERROR]:           ERR,
};
const DEFAULT_CONFIG = NEUTRAL;

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch (_) { return ''; }
}

export default function LiveFeed({ events, connected }) {
  const reduceMotion = useReducedMotion();
  const visible = events.filter(e => !e.type.startsWith('log.'));
  return (
    <section className="relative z-10 mb-6">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-telgrarr-purple" />
          <h2 className="text-lg font-semibold">Live Events</h2>
        </div>
        <div className="flex items-center gap-1.5">
          {connected
            ? <Wifi className="w-3.5 h-3.5 text-telgrarr-success" />
            : <WifiOff className="w-3.5 h-3.5 text-telgrarr-danger animate-pulse" />}
          <span className={['text-xs font-medium', connected ? 'text-telgrarr-success' : 'text-telgrarr-danger'].join(' ')}>
            {connected ? 'Live' : 'Reconnecting'}
          </span>
        </div>
      </div>
      {visible.length === 0 ? (
        <div className="glass-panel rounded-xl p-6 text-center text-telgrarr-muted text-sm">
          <p>Waiting for activity...</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <AnimatePresence initial={false}>
            {[...visible].reverse().map((evt) => {
              const cfg = TYPE_CONFIG[evt.type] || DEFAULT_CONFIG;
              return (
                <motion.div
                  key={evt.id}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
                  animate={reduceMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 10 }}
                  transition={{ duration: 0.2 }}
                  className={'flex items-start gap-3 rounded-xl px-3 py-2.5 ' + cfg.bg}
                >
                  <span className={'mt-1.5 w-1.5 h-1.5 rounded-full flex-none ' + cfg.dot} />
                  <div className="flex-1 min-w-0">
                    <p className={'text-sm font-medium break-words whitespace-pre-wrap leading-relaxed ' + cfg.color}>{evt.message}</p>
                    <p className="text-[10px] text-telgrarr-muted mt-0.5 font-mono">{evt.module} · {formatTime(evt.timestamp)}</p>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}
