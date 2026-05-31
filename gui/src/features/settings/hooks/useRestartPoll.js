import { useState, useRef, useEffect, useCallback } from 'react';
import api from '../../../api';

export default function useRestartPoll(fetchSettings) {
  const [restarting, setRestarting] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  const startRestartPoll = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);

    setRestarting(true);
    pollRef.current = setInterval(async () => {
      try {
        const r = await api.get('/health', { timeout: 2000 });
        if (r.status === 200) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setRestarting(false);
          fetchSettings();
        }
      } catch (_) {
        // Expected during restart sequence
      }
    }, 1500);
  }, [fetchSettings]);

  return { restarting, startRestartPoll };
}
