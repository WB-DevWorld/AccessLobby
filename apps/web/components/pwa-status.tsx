'use client';

import { useEffect, useState } from 'react';

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export function PwaStatus() {
  const [offline, setOffline] = useState(false);
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [installing, setInstalling] = useState(false);
  useEffect(() => {
    const connection = () => setOffline(!navigator.onLine);
    const offerInstall = (event: Event) => {
      if (matchMedia('(display-mode: standalone)').matches) return;
      event.preventDefault(); setInstall(event as InstallPrompt);
    };
    const installed = () => setInstall(null);
    connection();
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    window.addEventListener('beforeinstallprompt', offerInstall);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('online', connection); window.removeEventListener('offline', connection);
      window.removeEventListener('beforeinstallprompt', offerInstall); window.removeEventListener('appinstalled', installed);
    };
  }, []);
  if (offline) return <aside className="connection-notice" role="status">Connection lost. Sign-in and account checks need a connection.</aside>;
  if (!install) return null;
  return <aside className="install-offer" aria-label="Install AccessLobby">
    <span>Keep AccessLobby close.</span>
    <button type="button" disabled={installing} onClick={async () => {
      setInstalling(true);
      try { await install.prompt(); await install.userChoice; setInstall(null); }
      catch { setInstall(null); }
      finally { setInstalling(false); }
    }}>{installing ? 'Opening install…' : 'Install AccessLobby'}</button>
    <button type="button" aria-label="Dismiss install suggestion" onClick={() => setInstall(null)}>×</button>
  </aside>;
}
