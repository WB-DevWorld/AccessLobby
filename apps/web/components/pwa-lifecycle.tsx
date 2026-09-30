'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { safeUpdateBoundary } from '@/lib/pwa-update-policy';

const UPDATE_INTERVAL_MS = 30 * 60 * 1000;
const CHECK_THROTTLE_MS = 60 * 1000;

export function PwaLifecycle() {
  const pathname = usePathname();
  const [waiting, setWaiting] = useState(false);
  const [deferred, setDeferred] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const activating = useRef(false);
  const lastCheck = useRef(0);
  const safe = safeUpdateBoundary(pathname, dirty);
  const safeRef = useRef(safe);
  safeRef.current = safe;

  useEffect(() => { setDirty(false); setDeferred(false); }, [pathname]);
  useEffect(() => {
    const markDirty = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('form')) setDirty(true);
    };
    const markSubmitting = (event: Event) => {
      if (event.target instanceof HTMLFormElement) setDirty(true);
    };
    document.addEventListener('input', markDirty, true);
    document.addEventListener('change', markDirty, true);
    document.addEventListener('submit', markSubmitting, true);
    return () => {
      document.removeEventListener('input', markDirty, true);
      document.removeEventListener('change', markDirty, true);
      document.removeEventListener('submit', markSubmitting, true);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    let channel: BroadcastChannel | null = null;
    const onControllerChange = () => {
      if (activating.current && safeRef.current) window.location.reload();
      activating.current = false;
    };
    const showWaiting = (worker?: ServiceWorker | null, announce = true) => {
      if (!cancelled && worker && navigator.serviceWorker.controller) {
        setWaiting(true);
        setDeferred(false);
        if (announce) channel?.postMessage({ type: 'update-ready' });
      }
    };
    const check = async (force = false) => {
      const current = registration.current;
      if (!current || (!force && Date.now() - lastCheck.current < CHECK_THROTTLE_MS)) return;
      lastCheck.current = Date.now();
      try { await current.update(); showWaiting(current.waiting); } catch { setError(true); }
    };
    const onResume = () => { if (!document.hidden) void check(); };
    const onFocus = () => { void check(); };
    const onReconnect = () => { void check(); };
    const timer = window.setInterval(() => void check(), UPDATE_INTERVAL_MS);
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel('accesslobby-pwa-update');
      channel.onmessage = (event: MessageEvent) => {
        if (event.data?.type === 'update-ready') showWaiting(registration.current?.waiting, false);
      };
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onReconnect);
    void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((current) => {
        if (cancelled) return;
        registration.current = current;
        showWaiting(current.waiting);
        current.addEventListener('updatefound', () => {
          const installing = current.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed') showWaiting(current.waiting || installing);
          });
        });
        void check(true);
      }).catch(() => { if (!cancelled) setError(true); });
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      channel?.close();
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onReconnect);
    };
  }, []);

  if (!waiting || deferred) return null;
  return <aside className="pwa-update" role="status" aria-live="polite">
    <strong>Update ready</strong>
    <span>A newer version of AccessLobby is available.</span>
    {safe ? <button type="button" onClick={() => {
      const worker = registration.current?.waiting;
      if (!worker || !safeRef.current) return;
      activating.current = true;
      worker.postMessage({ type: 'ACCESSLOBBY_ACTIVATE' });
    }}>Update now</button> : <span>Finish this account step, then return home to update.</span>}
    <button type="button" onClick={() => setDeferred(true)}>Later</button>
    {error && <span>Update check will retry when the connection returns.</span>}
  </aside>;
}
