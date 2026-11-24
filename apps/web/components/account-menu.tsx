'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

export function AccountMenu({ mobile = false }: { mobile?: boolean }) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !details.current?.contains(event.target) && details.current) details.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && details.current?.open) {
        details.current.open = false;
        details.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', escape); };
  }, []);
  return <details ref={details} className={`account-menu ${mobile ? 'mobile-more' : ''}`}>
    <summary><span aria-hidden="true">{mobile ? '•••' : '☰'}</span><span>{mobile ? 'More' : 'Account'}</span></summary>
    <nav className="account-menu-panel" aria-label={mobile ? 'More account sections' : 'Account options'} onClick={event => {
      if (event.target instanceof Element && event.target.closest('a') && details.current) details.current.open = false;
    }}>
      <Link href="/contexts">Personal & organizations</Link>
      <Link href="/recovery">Recovery & help</Link>
      <Link href="/apps/manage">Developer tools</Link>
      <Link href="/help">Help</Link>
      <Link href="/privacy">Privacy information</Link>
      <Link href="/auth/login?intent=switch">Sign in as another person</Link>
      <Link className="menu-sign-out" href="/sign-out">Sign out</Link>
    </nav>
  </details>;
}
