'use client';

import {useEffect, useRef, useState, type CSSProperties, type ReactNode} from 'react';

/**
 * Motion that explains a change, and nothing else.
 *
 * - `Reveal` fades a section in as it scrolls into view. It is visible by
 *   default; `RevealRoot` only opts the document in once an observer exists,
 *   so a page without JS (or with reduced motion) loses nothing.
 * - `CountUp` eases a number to its value, so a figure that changed is seen
 *   to change. Reduced motion shows the final number at once.
 */

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Marks the document as able to reveal, and watches every [data-reveal]. */
export function RevealRoot() {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const root = document.documentElement;
    root.classList.add('js-reveal');

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-shown', '');
            observer.unobserve(entry.target);
          }
        }
      },
      {rootMargin: '0px 0px -8% 0px', threshold: 0.05},
    );

    const watch = () =>
      document.querySelectorAll('[data-reveal]:not([data-shown])').forEach((el) => observer.observe(el));
    watch();
    // Client navigation and data arriving add new sections; pick them up.
    const mutations = new MutationObserver(watch);
    mutations.observe(document.body, {childList: true, subtree: true});

    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, []);
  return null;
}

export function Reveal({
  children,
  index = 0,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  /** Position in a group, for a staggered entrance. */
  index?: number;
  className?: string;
  as?: 'div' | 'section' | 'li';
}) {
  return (
    <Tag data-reveal="" style={{'--i': index} as CSSProperties} className={className}>
      {children}
    </Tag>
  );
}

export function CountUp({
  value,
  duration = 700,
  format,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(origin + (value - origin) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  const rounded = Number.isInteger(value) ? Math.round(shown) : shown;
  return <>{format ? format(rounded) : String(rounded)}</>;
}
