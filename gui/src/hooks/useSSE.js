import { useEffect, useRef, useState } from 'react';
import useAuthStore from '../store/authStore';
import EVENT_TYPES from '../shared/events.json';

const MAX_EVENTS = 15;

export default function useSSE() {
  const { token } = useAuthStore();
  const [connected, setConnected] = useState(false);
  const [events, setEvents]       = useState([]);
  const [queueState, setQueueState] = useState({ active: false, expiresAt: null });
  const esRef    = useRef(null);
  const retryRef = useRef(null);

  useEffect(() => {
    if (!token) return;

    function connect() {
      if (esRef.current) esRef.current.close();
      const es = new EventSource('/api/stream?token=' + token);
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
      if (retryRef.current) clearTimeout(retryRef.current);
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
      setConnected(false);
    };
  }, [token]);

  return { connected, events, queueState };
}
