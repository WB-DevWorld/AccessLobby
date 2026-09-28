'use client';

import { useState } from 'react';

type CopyIdentifierProps = {
  label: string;
  value: string;
  description: string;
};

export function CopyIdentifier({ label, value, description }: CopyIdentifierProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copyIdentifier() {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  return (
    <div className="identifier-block">
      <div className="identifier-heading">
        <span>{label}</span>
        <button className="identifier-copy" type="button" onClick={copyIdentifier}>
          {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy ID'}
        </button>
      </div>
      <code>{value}</code>
      <p>{description}</p>
      <span className="sr-only" aria-live="polite">
        {copyState === 'copied' ? `${label} copied.` : copyState === 'failed' ? `${label} could not be copied.` : ''}
      </span>
    </div>
  );
}
