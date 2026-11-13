'use client';

import {useEffect, useRef} from 'react';

/**
 * When `key` changes to a value (a job just created, a selection just made),
 * bring the element into view and move focus to it, so the next step is where
 * the person is looking. Live test, 2026-11-13: after Hire and after "Confirm
 * selection" the page jumped, and "Sign and fund the job" was off-screen.
 */
export function useReveal<T extends HTMLElement>(key: string | null | undefined) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!key) return;
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({block: 'center', behavior: reduce ? 'auto' : 'smooth'});
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({preventScroll: true});
  }, [key]);
  return ref;
}
