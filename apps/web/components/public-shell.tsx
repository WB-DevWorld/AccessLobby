import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandMark, SkipLink } from '@/components/ui';
import { ThemeToggle } from '@/components/theme-toggle';

export function PublicShell({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="public-page">
    <SkipLink />
    <header className="public-header">
      <Link href="/" aria-label="AccessLobby home"><BrandMark /></Link>
      <nav className="public-header-actions" aria-label="Website navigation">
        <Link className="public-help-link" href="/#how-it-works">How it works</Link>
        <Link className="public-help-link" href="/help">Help</Link>
        <ThemeToggle />{action ?? <Link className="button button-primary button-compact" href="/auth/login">Sign in</Link>}
      </nav>
    </header>
    <main className="public-main" id="main-content">{children}</main>
    <footer className="public-footer"><BrandMark /><span>One identity. Clear choices.</span>
      <nav aria-label="Footer"><Link href="/privacy">Privacy information</Link><Link href="/help#access">Pilot access</Link><Link href="/help#support">Support</Link></nav>
    </footer>
  </div>;
}
