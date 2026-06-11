import { useState, useRef, useEffect, useCallback } from 'react';
import api from '../../../api';
import useSettingsStore from '../../../store/settingsStore';

const POLL_INTERVAL_MS = 1500;
const RECOVERY_TIMEOUT_MS = 90000;

// Drives the GUI side of a restart-required apply. Capability comes from
// /system/info (fetched on mount, held in settingsStore): when the deployment
// cannot self-restart, the backend refused the restart and the saved change is
// staged-but-inactive, so we surface manual guidance instead of polling a process
// that will never bounce. When capable, we poll the REAL root /health until the
// process answers, with a recovery timeout so a restart that never returns degrades
// to manual guidance rather than hanging the overlay forever.
export default function useRestartPoll(fetchSettings) {
  const [restarting, setRestarting] = useState(false);
  const [manualRestart, setManualRestart] = useState(false);
  const pollRef = useRef(null);
  const deadlineRef = useRef(0);

  const stop = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stop, [stop]);

  const startRestartPoll = useCallback(() => {
    const capable = useSettingsStore.getState().systemInfo?.restartCapable;
    if (!capable) {
      setManualRestart(true);
      return;
    }

    stop();
    setManualRestart(false);
    setRestarting(true);
    deadlineRef.current = Date.now() + RECOVERY_TIMEOUT_MS;

    pollRef.current = setInterval(async () => {
      if (Date.now() > deadlineRef.current) {
        stop();
        setRestarting(false);
        setManualRestart(true);
        return;
      }
      try {
        // Root /health, NOT /api/health — api's baseURL is '/api', so override it.
        const r = await api.get('/health', { baseURL: '', timeout: 2000 });
        if (r.status === 200) {
          stop();
          setRestarting(false);
          fetchSettings();
        }
      } catch {
        // Expected while the backend is down mid-restart — keep polling.
      }
    }, POLL_INTERVAL_MS);
  }, [stop, fetchSettings]);

  const dismissManualRestart = useCallback(() => setManualRestart(false), []);

  return { restarting, manualRestart, startRestartPoll, dismissManualRestart };
}
