import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { ScrollText, RefreshCw, ChevronDown, Filter } from 'lucide-react';
import useSSE from '../hooks/useSSE';

const LEVELS  = ['all', 'info', 'warn', 'error'];
const MODULES = ['all', 'Listener', 'Sweeper', 'Config', 'Auth', 'Emby', 'History'];

const LEVEL_STYLE = {
  info:  { badge: 'bg-sky-400/15 text-sky-400 border border-sky-400/20',     dot: 'bg-sky-400'    },
  warn:  { badge: 'bg-yellow-400/15 text-yellow-400 border border-yellow-400/20', dot: 'bg-yellow-400' },
  error: { badge: 'bg-red-400/15 text-red-400 border border-red-400/20',     dot: 'bg-red-400'    },
};
const DEFAULT_LEVEL = { badge: 'bg-white/10 text-telgrarr-muted border border-white/10', dot: 'bg-gray-500' };

function formatTime(iso) {
  try { return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); }
  catch (_) { return ''; }
}

export default function Logs() {
  const { events: sseEvents } = useSSE();
  const [logs, setLogs]         = useState([]);
  const [level, setLevel]       = useState('all');
  const [module, setModule]     = useState('all');
  const [loading, setLoading]   = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '200' });
    if (level  !== 'all') params.set('level',  level);
    if (module !== 'all') params.set('module', module);
    fetch('/api/logs?' + params.toString())
      .then(r => r.ok ? r.json() : [])
      .then(data => { setLogs(data); setLoading(false); })
      .catch(() => setLoading(false));
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
    if (autoScroll && bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [logs, autoScroll]);

  return (
    <div className="min-h-screen bg-telgrarr-black text-telgrarr-text flex flex-col pb-24 md:pb-8">
      
      {/* PERFECTLY BALANCED STICKY HEADER */}
      <div className="sticky top-0 z-30 bg-telgrarr-surface/90 backdrop-blur-xl border-b border-telgrarr-border shadow-sm flex flex-col">
        
        {/* Title & Toggle Row */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-telgrarr-border/50">
          <div className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-telgrarr-purple drop-shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
            <h1 className="text-lg font-bold text-telgrarr-text tracking-wide">System Logs</h1>
          </div>
          <button onClick={() => setAutoScroll(!autoScroll)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 ${autoScroll ? 'bg-telgrarr-purple/20 text-telgrarr-purple' : 'bg-telgrarr-surface text-telgrarr-muted border border-telgrarr-border'}`}>
            {autoScroll ? 'Live Scrolling' : 'Scroll Paused'}
          </button>
        </div>
        
        {/* Filter Dropdowns Row */}
        <div className="px-4 py-2 flex gap-2">
          <div className="relative flex-1">
            <select value={level} onChange={e => setLevel(e.target.value)} className="w-full appearance-none bg-telgrarr-black/50 border border-telgrarr-border rounded-lg py-2 pl-3 pr-8 text-xs font-medium text-telgrarr-text focus:outline-none focus:border-telgrarr-purple transition-colors">
              {LEVELS.map(l => <option key={l} value={l}>Level: {l.toUpperCase()}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-telgrarr-muted pointer-events-none" />
          </div>
          <div className="relative flex-1">
            <select value={module} onChange={e => setModule(e.target.value)} className="w-full appearance-none bg-telgrarr-black/50 border border-telgrarr-border rounded-lg py-2 pl-3 pr-8 text-xs font-medium text-telgrarr-text focus:outline-none focus:border-telgrarr-purple transition-colors">
              {MODULES.map(m => <option key={m} value={m}>Mod: {m}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-telgrarr-muted pointer-events-none" />
          </div>
        </div>
        
      </div>

      {/* LOG LIST WRAPPER */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1.5">
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
              <motion.div key={entry.id || idx} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}
                className="flex items-start gap-2.5 py-2.5 px-3 rounded-xl bg-telgrarr-surface/60 hover:bg-telgrarr-surface border border-transparent hover:border-telgrarr-border transition-all"
              >
                <span className={'mt-1.5 w-1.5 h-1.5 rounded-full flex-none shadow-[0_0_8px_currentColor] ' + style.dot} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ' + style.badge}>{entry.level}</span>
                    <span className="text-[10px] text-telgrarr-muted font-mono bg-telgrarr-black/30 px-1.5 py-0.5 rounded">{entry.module}</span>
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
