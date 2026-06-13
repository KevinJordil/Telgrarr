import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Clock, Film, Tv } from 'lucide-react';
import api from '../api';
import useSSE from '../hooks/useSSE';
import QueueWidget from '../components/QueueWidget';
import LiveFeed from '../components/LiveFeed';

export default function Dashboard() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const { connected, events, queueState } = useSSE();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/history');
        if (!cancelled) setHistory(Array.isArray(data) ? data : []);
      } catch (err) {
        // 401 -> global api interceptor handles logout/redirect; other errors leave list empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="bg-telgrarr-black text-telgrarr-text p-4 overflow-x-hidden relative">
      <div className="absolute top-0 left-0 w-full h-96 bg-linear-to-b from-telgrarr-purple/10 to-transparent pointer-events-none" />
      <QueueWidget queueState={queueState} />
      <section className="relative z-10 mb-8 max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mb-4 px-1">
          <Clock className="w-5 h-5 text-telgrarr-purple" />
          <h2 className="text-lg font-semibold tracking-wide">Recently Notified</h2>
        </div>
        {loading ? (
          <div className="flex md:grid md:grid-cols-4 lg:grid-cols-5 space-x-4 md:space-x-0 md:gap-4 overflow-x-auto pb-6 px-1">
            {[1, 2, 3, 4, 5].map(n => (
              <div key={n} className="flex-none w-36 md:w-full aspect-[2/3] bg-telgrarr-surface/50 rounded-xl animate-pulse border border-telgrarr-border/50" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <div className="glass-panel p-8 text-center text-telgrarr-muted rounded-xl flex flex-col items-center justify-center min-h-[200px]">
            <Film className="w-8 h-8 mb-3 opacity-30" />
            <p className="text-sm font-medium tracking-wide">No recent notifications.</p>
          </div>
        ) : (
          <div className="flex md:grid md:grid-cols-4 lg:grid-cols-5 overflow-x-auto md:overflow-visible gap-4 pb-6 px-1 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {history.map((item, idx) => (
              <motion.div
                key={item.id}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduceMotion ? { duration: 0.15 } : { delay: idx * 0.05 }}
                className="flex-none w-[140px] md:w-full snap-start"
              >
                <div className="relative aspect-[2/3] rounded-xl overflow-hidden mb-3 border border-telgrarr-border shadow-md bg-telgrarr-surface">
                  {item.poster ? (
                    <img src={item.poster} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-telgrarr-black/30">
                      <Film className="w-8 h-8 text-telgrarr-muted" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2 bg-telgrarr-black/80 backdrop-blur-md px-2 py-1 rounded-md border border-telgrarr-border flex items-center gap-1 shadow-xs">
                    {item.type === 'movie' ? <Film className="w-3 h-3 text-telgrarr-purple" /> : <Tv className="w-3 h-3 text-telgrarr-purple" />}
                  </div>
                </div>
                <h3 className="font-semibold text-sm truncate text-telgrarr-text leading-tight">{item.title}</h3>
                <p className="text-[11px] text-telgrarr-muted mt-0.5 truncate font-medium">
                  {item.year ? item.year + ' • ' : ''}{item.details}
                </p>
              </motion.div>
            ))}
          </div>
        )}
      </section>
      <div className="max-w-5xl mx-auto">
        <LiveFeed events={events} connected={connected} />
      </div>
    </div>
  );
}
