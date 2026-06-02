import { useEffect, useRef, useState } from 'react';
import useAuthStore from '../store/authStore';
import EVENT_TYPES from '../shared/events.json';
import api from '../api';

const MAX_EVENTS = 15;

export default function useSSE() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [connected, setConnected] = useState(false);
  const [events, setEvents]       = useState([]);
  const [queueState, setQueueState] = useState({ active: false, expiresAt: null });
  const esRef    = useRef(null);
  const retryRef = useRef(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    async function connect() {
      if (cancelled) return;
      if (esRef.current) esRef.current.close();
      let ticket;
      try {
        const res = await api.get('/stream-ticket');
        ticket = res.data.ticket;
      } catch (_) {
        if (cancelled) return;
        setConnected(false);
        retryRef.current = setTimeout(connect, 5000);
        return;
      }
      if (cancelled) return;
      const es = new EventSource('/api/stream?ticket=' + ticket);
      esRef.current = es;

      es.onopen = () => setConnected(true);

      es.onerror = () => {
        setConnected(false);
        es.close();
        esRef.current = null;
        retryRef.current = setTimeout(connect, 5000);
      };

      function handleEvent(e) {
        try {
          const data = JSON.parse(e.data);
          setEvents(prev => {
            const next = [...prev, data];
            return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
          });

          if (data.type === EVENT_TYPES.QUEUE_TIMER_STARTED) {
            setQueueState({ active: true, expiresAt: data.data && data.data.expiresAt });
          } else if (
            data.type === EVENT_TYPES.QUEUE_DRAINED ||
            data.type === EVENT_TYPES.SWEEP_COMPLETE ||
            data.type === EVENT_TYPES.QUEUE_CLEARED ||
            data.type === EVENT_TYPES.QUEUE_FLUSH
          ) {
            setQueueState({ active: false, expiresAt: null });
          }
        } catch (_) {}
      }

      Object.values(EVENT_TYPES).forEach(t => es.addEventListener(t, handleEvent));
    }

    connect();

    return () => {
      cancelled = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
      setConnected(false);
    };
  }, [isAuthenticated]);

  return { connected, events, queueState };
}
