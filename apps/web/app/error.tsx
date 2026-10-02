'use client';
import Link from 'next/link';
import { PublicShell } from '@/components/public-shell';
export default function PageError({ reset }: { reset: () => void }) {
  return <PublicShell><section className="reading-page" role="alert"><p className="eyebrow">Something went wrong</p><h1>This page could not be loaded.</h1><p>Please try again. No successful account change is confirmed by this message.</p><div className="hero-actions"><button className="button button-primary" type="button" onClick={reset}>Try again</button><Link className="button button-secondary" href="/">Return home</Link></div></section></PublicShell>;
}
