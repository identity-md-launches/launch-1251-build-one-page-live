import { useEffect, useRef, useState } from 'react';
import { fetchSnapshot, REFRESH_INTERVAL_MS, REQUEST_TIMEOUT_MS } from './api';
import type { Snapshot } from './api';

type LiveState = {
  phase: 'loading' | 'ready' | 'refreshing' | 'error';
  snapshot: Snapshot | null;
  updatedAt: number | null;
};

const initialState: LiveState = { phase: 'loading', snapshot: null, updatedAt: null };

export function useLiveNetwork() {
  const [state, setState] = useState<LiveState>(initialState);
  const [now, setNow] = useState(Date.now);
  const trigger = useRef<() => void>(() => {});

  useEffect(() => {
    let disposed = false;
    let active: AbortController | null = null;
    let lastSuccess: number | null = null;

    const fail = () => {
      lastSuccess = null;
      setState({ phase: 'error', snapshot: null, updatedAt: null });
    };

    const refresh = async () => {
      if (disposed || active) return;
      if (!navigator.onLine) {
        fail();
        return;
      }
      const request = new AbortController();
      active = request;
      // Keep the last successful snapshot during a short refresh, explicitly
      // labeled "Refreshing". Never retain a snapshot after failure or expiry.
      setState((previous) => {
        const fresh = previous.updatedAt !== null && Date.now() - previous.updatedAt <= REFRESH_INTERVAL_MS;
        return fresh && previous.snapshot
          ? { ...previous, phase: 'refreshing' }
          : initialState;
      });
      const timeout = window.setTimeout(() => request.abort(), REQUEST_TIMEOUT_MS);
      try {
        const snapshot = await fetchSnapshot(request.signal);
        if (disposed || active !== request) return;
        lastSuccess = Date.now();
        setNow(lastSuccess);
        setState({ phase: 'ready', snapshot, updatedAt: lastSuccess });
      } catch {
        if (!disposed && active === request) fail();
      } finally {
        window.clearTimeout(timeout);
        request.abort();
        if (active === request) active = null;
      }
    };

    const offline = () => {
      active?.abort();
      active = null;
      fail();
    };

    const resume = () => {
      if (document.visibilityState !== 'visible') return;
      // A suspended tab must not present an old snapshot as live on return.
      if (lastSuccess === null || Date.now() - lastSuccess >= REFRESH_INTERVAL_MS) {
        active?.abort();
        active = null;
        lastSuccess = null;
        setState(initialState);
        void refresh();
      }
    };

    trigger.current = () => { void refresh(); };
    const poll = window.setInterval(() => { void refresh(); }, REFRESH_INTERVAL_MS);
    const clock = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      // This also covers delayed timers after device sleep / background throttling.
      if (lastSuccess !== null && current - lastSuccess > REFRESH_INTERVAL_MS + REQUEST_TIMEOUT_MS) {
        lastSuccess = null;
        setState(initialState);
        void refresh();
      }
    }, 1_000);
    window.addEventListener('offline', offline);
    window.addEventListener('online', resume);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    void refresh();

    return () => {
      disposed = true;
      active?.abort();
      window.clearInterval(poll);
      window.clearInterval(clock);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', resume);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);

  return { ...state, now, refresh: () => trigger.current() };
}
