import type { Metadata, Viewport } from 'next';
import { PwaLifecycle } from '@/components/pwa-lifecycle';
import { PwaStatus } from '@/components/pwa-status';
import './style.css';
import './alignment.css';
import './refinement.css';

export const metadata: Metadata = {
  title: {
    default: 'AccessLobby',
    template: '%s | AccessLobby',
  },
  description: 'One secure AccessLobby identity for supported apps, with clear account and sign-out controls.',
  applicationName: 'AccessLobby',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'AccessLobby', statusBarStyle: 'default' },
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f7fb' },
    { media: '(prefers-color-scheme: dark)', color: '#08111f' },
  ],
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><noscript><div className="noscript-notice">Some account pages need JavaScript to finish loading. Turn it on and reload to use all account controls.</div><style>{'.skeleton-section, .skeleton-identity { display: none !important; }'}</style></noscript>{children}<PwaLifecycle /><PwaStatus /></body></html>;
}
