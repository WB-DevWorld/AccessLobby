import type { Metadata, Viewport } from 'next';
import './style.css';

export const metadata: Metadata = {
  title: {
    default: 'AccessLobby',
    template: '%s | AccessLobby',
  },
  description: 'Your identity, your access and your account controls.',
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
  return <html lang="en"><body>{children}</body></html>;
}
