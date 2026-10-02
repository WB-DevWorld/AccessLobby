'use client';
import { useState } from 'react';
import type { AvailableApplication } from '@/lib/applications';
export function AppCards({ applications, compact = false }: { applications: AvailableApplication[]; compact?: boolean }) {
  const [query, setQuery] = useState('');
  const filtered = applications.filter(app => app.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const shown = compact ? filtered.slice(0, 4) : filtered;
  return <>
    {!compact && applications.length > 6 && <div className="app-search"><label htmlFor="app-search">Find an app</label><input id="app-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search available apps" /></div>}
    {shown.length === 0 ? <p role="status">No apps match your search.</p> : <ul className={`app-card-list ${compact ? 'app-card-list-compact' : ''}`}>{shown.map(app => <li key={app.id}><span className="app-monogram" aria-hidden="true">{app.name.slice(0, 1).toUpperCase()}</span><div><strong>{app.name}</strong><small>{app.admission === 'authenticated_open' ? 'Open to signed-in people' : 'Entry granted to you'}</small></div></li>)}</ul>}
  </>;
}
