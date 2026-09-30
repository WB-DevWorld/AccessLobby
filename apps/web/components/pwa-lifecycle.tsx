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
  const [updating, setUpdating] = useState(false);
  const [activationMessage, setActivationMessage] = useState('');
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const activating = useRef(false);
  const dirtyRef = useRef(false);
  const pendingActivation = useRef<{ port: MessagePort; timer: number } | null>(null);
  const lastCheck = useRef(0);
  const safe = safeUpdateBoundary(pathname, dirty);
  const safeRef = useRef(safe);
  safeRef.current = safe;

  useEffect(() => {
    dirtyRef.current = false;
    setDirty(false); setDeferred(false); setActivationMessage('');
  }, [pathname]);
  useEffect(() => {
    const holdUpdate = () => {
      dirtyRef.current = true;
      safeRef.current = false;
      setDirty(true);
    };
    const markDirty = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('form')) holdUpdate();
    };
    const markSubmitting = (event: Event) => {
      if (event.target instanceof HTMLFormElement) holdUpdate();
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
      const requested = activating.current;
      activating.current = false;
      if (pendingActivation.current) {
        window.clearTimeout(pendingActivation.current.timer);
        pendingActivation.current.port.close();
        pendingActivation.current = null;
      }
      setWaiting(false); setUpdating(false); setActivationMessage('');
      if (requested && safeRef.current && safeUpdateBoundary(window.location.pathname, dirtyRef.current)) {
        window.location.reload();
      }
    };
    const onSafetyCheck = (event: MessageEvent) => {
      if (event.data?.type !== 'ACCESSLOBBY_CHECK_UPDATE_SAFETY' ||
          !(event.source instanceof ServiceWorker) ||
          event.source.scriptURL !== new URL('/sw.js', window.location.origin).href) return;
      const port = event.ports[0];
      port?.postMessage({
        safe: safeRef.current && safeUpdateBoundary(window.location.pathname, dirtyRef.current),
      });
      port?.close();
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
    navigator.serviceWorker.addEventListener('message', onSafetyCheck);
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
      navigator.serviceWorker.removeEventListener('message', onSafetyCheck);
      if (pendingActivation.current) {
        window.clearTimeout(pendingActivation.current.timer);
        pendingActivation.current.port.close();
        pendingActivation.current = null;
      }
      activating.current = false;
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
      if (!worker || activating.current || !safeRef.current ||
          !safeUpdateBoundary(window.location.pathname, dirtyRef.current)) return;
      activating.current = true;
      setUpdating(true); setActivationMessage('');
      const channel = new MessageChannel();
      const finish = (message: string) => {
        if (pendingActivation.current?.port !== channel.port1) return;
        window.clearTimeout(pendingActivation.current.timer);
        channel.port1.close(); pendingActivation.current = null;
        activating.current = false; setUpdating(false); setActivationMessage(message);
      };
      const timer = window.setTimeout(() => finish('The update did not finish. Try again when all AccessLobby windows are ready.'), 5000);
      pendingActivation.current = { port: channel.port1, timer };
      channel.port1.onmessage = (event) => {
        if (event.data?.type !== 'ACCESSLOBBY_ACTIVATION_RESULT') return;
        if (event.data.status === 'blocked') finish('Finish or close other AccessLobby windows, then try Update now again.');
        else if (event.data.status === 'failed') finish('The update did not finish. Please try again.');
      };
      try { worker.postMessage({ type: 'ACCESSLOBBY_ACTIVATE', protocol: 2 }, [channel.port2]); }
      catch { finish('The update did not finish. Please try again.'); }
    }} disabled={updating}>{updating ? 'Checking windows…' : 'Update now'}</button> : <span>Finish this account step, then return home to update.</span>}
    <button type="button" onClick={() => setDeferred(true)} disabled={updating}>Later</button>
    {activationMessage && <span>{activationMessage}</span>}
    {error && <span>Update check will retry when the connection returns.</span>}
  </aside>;
}
