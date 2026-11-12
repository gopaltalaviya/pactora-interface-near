'use client';

import {useEffect} from 'react';

/**
 * Arrived at `#<id>` (a fix link such as /me#faucet or …/manage#fund-card):
 * once `ready`, bring the element into view, and keep it there while what is
 * above it is still loading and changing height (a panel of balances that
 * grows from a skeleton pushed the card off a phone's screen). It stops at
 * the person's first scroll, key or touch, or after a few seconds. Jumps, no
 * smooth scrolling, so reduced motion has nothing to turn off.
 */
export function useLandOn(id: string, ready: boolean): void {
  useEffect(() => {
    if (!ready || typeof window === 'undefined' || window.location.hash !== `#${id}`) return;
    const el = document.getElementById(id);
    if (!el) return;
    const go = () => el.scrollIntoView({block: 'start'});
    go();
    let observer: ResizeObserver | null = null;
    const stop = () => {
      observer?.disconnect();
      observer = null;
    };
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => go());
      observer.observe(document.body);
    }
    const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
    events.forEach((e) => window.addEventListener(e, stop, {once: true, passive: true}));
    const timer = setTimeout(stop, 4000);
    return () => {
      stop();
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, stop));
    };
  }, [id, ready]);
}
