import type { Metadata, Viewport } from 'next';
import { PwaLifecycle } from '@/components/pwa-lifecycle';
import './style.css';
import './alignment.css';

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
  return <html lang="en"><body>{children}<PwaLifecycle /></body></html>;
}
