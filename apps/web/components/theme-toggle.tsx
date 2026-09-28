'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'accesslobby-theme';
const CHOICES = ['system', 'light', 'dark'] as const;

type ThemeChoice = (typeof CHOICES)[number];

function isThemeChoice(value: string | null): value is ThemeChoice {
  return value === 'system' || value === 'light' || value === 'dark';
}

function applyTheme(choice: ThemeChoice) {
  if (choice === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
}

export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>('system');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!isThemeChoice(stored)) return;
    setChoice(stored);
    applyTheme(stored);
  }, []);

  function cycleTheme() {
    const next = CHOICES[(CHOICES.indexOf(choice) + 1) % CHOICES.length];
    setChoice(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  const visible = choice === 'system' ? 'System' : choice === 'light' ? 'Light' : 'Dark';

  return (
    <button
      type="button"
      className="button button-secondary button-compact theme-toggle"
      onClick={cycleTheme}
      aria-label={`Color theme: ${choice}. Activate to switch theme.`}
    >
      <span aria-hidden="true">{visible}</span>
    </button>
  );
}
