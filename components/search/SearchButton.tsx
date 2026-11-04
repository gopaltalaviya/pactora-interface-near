'use client';

import {useEffect, useState} from 'react';
import {Icon} from '@/components/ui/Icon';
import {openSearch} from './events';

/**
 * Opens the one search palette. `wide` is the docs-sidebar field; the compact
 * form sits in the header. The shortcut label matches the platform.
 */
export function SearchButton({wide = false}: {wide?: boolean}) {
  const [mod, setMod] = useState('Ctrl');
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setMod('⌘');
  }, []);

  if (wide) {
    return (
      <button
        type="button"
        onClick={openSearch}
        className="flex h-9 w-full items-center gap-2 rounded-lg border border-edge bg-ink/60 px-3 text-sm text-muted transition-colors hover:border-edge-strong hover:text-text"
      >
        <Icon name="search" className="size-3.5" />
        <span className="flex-1 text-left">Search docs…</span>
        <kbd className="rounded border border-edge px-1.5 text-[10px]">{mod} K</kbd>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={openSearch}
      aria-label="Search"
      className="flex h-8 items-center gap-2 rounded-lg border border-edge px-2 text-xs text-muted transition-colors hover:border-edge-strong hover:text-text sm:px-2.5"
    >
      <Icon name="search" className="size-3.5" />
      <span className="hidden lg:inline">Search</span>
      <kbd className="hidden rounded border border-edge px-1 text-[10px] lg:inline">{mod} K</kbd>
    </button>
  );
}
