import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Wifi, WifiOff } from 'lucide-react';
import EVENT_TYPES from '@shared/events.json';

const TYPE_CONFIG = {
  [EVENT_TYPES.QUEUE_ITEM_ADDED]:    { color: 'text-blue-400',   bg: 'bg-blue-400/10',   dot: 'bg-blue-400'   },
  [EVENT_TYPES.QUEUE_TIMER_STARTED]: { color: 'text-indigo-400', bg: 'bg-indigo-400/10', dot: 'bg-indigo-400' },
  [EVENT_TYPES.QUEUE_FLUSH]:         { color: 'text-cyan-400',   bg: 'bg-cyan-400/10',   dot: 'bg-cyan-400'   },
  [EVENT_TYPES.QUEUE_CLEARED]:       { color: 'text-orange-400', bg: 'bg-orange-400/10', dot: 'bg-orange-400' },
  [EVENT_TYPES.QUEUE_DRAINED]:       { color: 'text-telgrarr-muted', bg: 'bg-white/5',   dot: 'bg-gray-500'   },
  [EVENT_TYPES.SWEEP_STARTED]:       { color: 'text-violet-400', bg: 'bg-violet-400/10', dot: 'bg-violet-400' },
  [EVENT_TYPES.SWEEP_ITEM_READY]:    { color: 'text-telgrarr-purple', bg: 'bg-telgrarr-purple/10', dot: 'bg-telgrarr-purple' },
  [EVENT_TYPES.SWEEP_TG_SENT]:       { color: 'text-emerald-400', bg: 'bg-emerald-400/10', dot: 'bg-emerald-400' },
  [EVENT_TYPES.SWEEP_COMPLETE]:      { color: 'text-green-400',  bg: 'bg-green-400/10',  dot: 'bg-green-400'  },
  [EVENT_TYPES.SWEEP_TG_ERROR]:      { color: 'text-red-400',    bg: 'bg-red-400/10',    dot: 'bg-red-400'    },
  [EVENT_TYPES.SWEEP_ERROR]:         { color: 'text-red-400',    bg: 'bg-red-400/10',    dot: 'bg-red-400'    },
  [EVENT_TYPES.SWEEP_EMBY]:          { color: 'text-sky-400',    bg: 'bg-sky-400/10',    dot: 'bg-sky-400'    },
  [EVENT_TYPES.AUTH_LOGIN_SUCCESS]:  { color: 'text-green-400',  bg: 'bg-green-400/10',  dot: 'bg-green-400'  },
  [EVENT_TYPES.AUTH_LOGIN_FAILED]:   { color: 'text-red-400',    bg: 'bg-red-400/10',    dot: 'bg-red-400'    },
  [EVENT_TYPES.AUTH_PW_CHANGED]:     { color: 'text-yellow-400', bg: 'bg-yellow-400/10', dot: 'bg-yellow-400' },
  [EVENT_TYPES.SETTINGS_SAVED]:      { color: 'text-sky-400',    bg: 'bg-sky-400/10',    dot: 'bg-sky-400'    },
  [EVENT_TYPES.SETTINGS_RESTART]:    { color: 'text-orange-400', bg: 'bg-orange-400/10', dot: 'bg-orange-400' },
  [EVENT_TYPES.LOG_WARN]:            { color: 'text-yellow-400', bg: 'bg-yellow-400/10', dot: 'bg-yellow-400' },
  [EVENT_TYPES.LOG_ERROR]:           { color: 'text-red-400',    bg: 'bg-red-400/10',    dot: 'bg-red-400'    },
};

const DEFAULT_CONFIG = { color: 'text-telgrarr-muted', bg: 'bg-white/5', dot: 'bg-gray-600' };

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch (_) { return ''; }
}

export default function LiveFeed({ events, connected }) {
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
            ? <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            : <WifiOff className="w-3.5 h-3.5 text-red-400 animate-pulse" />}
          <span className={['text-xs font-medium', connected ? 'text-emerald-400' : 'text-red-400'].join(' ')}>
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
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
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
