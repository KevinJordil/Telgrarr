import React, { useEffect, useState, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ScrollText, ChevronDown, Filter } from 'lucide-react';
import useSSE from '../hooks/useSSE';
import api from '../api';

const LEVELS  = ['all', 'info', 'warn', 'error'];
const MODULES = ['all', 'Listener', 'Sweeper', 'Config', 'Auth', 'Emby', 'History'];

const LEVEL_STYLE = {
  info:  { badge: 'bg-telgrarr-purple/15 text-telgrarr-purple border border-telgrarr-purple/20',    dot: 'bg-telgrarr-purple'  },
  warn:  { badge: 'bg-telgrarr-warning/15 text-telgrarr-warning border border-telgrarr-warning/20', dot: 'bg-telgrarr-warning' },
  error: { badge: 'bg-telgrarr-danger/15 text-telgrarr-danger border border-telgrarr-danger/20',    dot: 'bg-telgrarr-danger'  },
};
const DEFAULT_LEVEL = { badge: 'bg-telgrarr-elevated text-telgrarr-muted border border-telgrarr-border', dot: 'bg-telgrarr-muted' };

function formatTime(iso) {
  try { return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); }
  catch (_) { return ''; }
}

export default function Logs() {
  const { events: sseEvents } = useSSE();
  const reduceMotion = useReducedMotion();
  const [logs, setLogs]         = useState([]);
  const [level, setLevel]       = useState('all');
  const [module, setModule]     = useState('all');
  const [loading, setLoading]   = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    const params = { limit: '200' };
    if (level  !== 'all') params.level  = level;
    if (module !== 'all') params.module = module;
    api.get('/logs', { params })
      .then(r => { setLogs(r.data); setLoading(false); })
      .catch(() => { setLogs([]); setLoading(false); });
  }, [level, module]);

  useEffect(() => {
    const logEvents = sseEvents.filter(e => e.type === 'log.info' || e.type === 'log.warn' || e.type === 'log.error');
    if (logEvents.length === 0) return;
    const latest = logEvents[logEvents.length - 1];
    if (!latest) return;
    const lv = latest.level || latest.type.replace('log.', '');
    const mod = latest.module || '';
    if (level  !== 'all' && lv  !== level)  return;
    if (module !== 'all' && mod !== module) return;
    setLogs(prev => {
      if (prev.some(l => l.id === latest.id)) return prev;
      return [...prev, { id: latest.id, level: lv, module: mod, message: latest.message, timestamp: latest.timestamp }];
    });
  }, [sseEvents, level, module]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) bottomRef.current.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [logs, autoScroll, reduceMotion]);

  return (
    <div className="text-telgrarr-text">
      {/* Sticky filter header — sticks within the AuthLayout scroll region */}
      <div className="sticky top-0 z-30 bg-telgrarr-surface/90 backdrop-blur-xl border-b border-telgrarr-border shadow-card flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-telgrarr-border/50">
          <div className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-telgrarr-purple" />
            <h1 className="text-lg font-bold text-telgrarr-text tracking-wide">System Logs</h1>
          </div>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            aria-pressed={autoScroll}
            className={`focus-ring px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors active:scale-95 ${autoScroll ? 'bg-telgrarr-purple/20 text-telgrarr-purple' : 'bg-telgrarr-elevated text-telgrarr-muted border border-telgrarr-border'}`}
          >
            {autoScroll ? 'Live Scrolling' : 'Scroll Paused'}
          </button>
        </div>
        <div className="px-4 py-2 flex gap-2">
          <div className="relative flex-1">
            <label htmlFor="log-level" className="sr-only">Filter by level</label>
            <select id="log-level" value={level} onChange={e => setLevel(e.target.value)} className="w-full appearance-none bg-telgrarr-elevated border border-telgrarr-border rounded-lg py-2 pl-3 pr-8 text-xs font-medium text-telgrarr-text focus:outline-hidden focus:border-telgrarr-purple transition-colors">
              {LEVELS.map(l => <option key={l} value={l}>Level: {l.toUpperCase()}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-telgrarr-muted pointer-events-none" />
          </div>
          <div className="relative flex-1">
            <label htmlFor="log-module" className="sr-only">Filter by module</label>
            <select id="log-module" value={module} onChange={e => setModule(e.target.value)} className="w-full appearance-none bg-telgrarr-elevated border border-telgrarr-border rounded-lg py-2 pl-3 pr-8 text-xs font-medium text-telgrarr-text focus:outline-hidden focus:border-telgrarr-purple transition-colors">
              {MODULES.map(m => <option key={m} value={m}>Mod: {m}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-telgrarr-muted pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-1.5">
        {loading ? (
          <div className="space-y-2 mt-2">
            {[...Array(8)].map((_, i) => <div key={i} className="h-10 bg-telgrarr-surface rounded-xl animate-pulse" />)}
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center text-telgrarr-muted py-16 text-sm flex flex-col items-center">
            <Filter className="w-8 h-8 mb-2 opacity-50" />
            No log entries match the current filter.
          </div>
        ) : (
          logs.map((entry, idx) => {
            const style = LEVEL_STYLE[entry.level] || DEFAULT_LEVEL;
            return (
              <motion.div
                key={entry.id || idx}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-start gap-2.5 py-2.5 px-3 rounded-xl bg-telgrarr-surface/60 hover:bg-telgrarr-surface border border-transparent hover:border-telgrarr-border transition-colors"
              >
                <span className={'mt-1.5 w-1.5 h-1.5 rounded-full flex-none ' + style.dot} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm ' + style.badge}>{entry.level}</span>
                    <span className="text-[10px] text-telgrarr-muted font-mono bg-telgrarr-elevated px-1.5 py-0.5 rounded-sm">{entry.module}</span>
                    <span className="text-[10px] text-telgrarr-muted font-mono ml-auto">{formatTime(entry.timestamp)}</span>
                  </div>
                  <p className="text-xs text-telgrarr-text/90 whitespace-pre-wrap break-all leading-relaxed font-mono">{entry.message}</p>
                </div>
              </motion.div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
