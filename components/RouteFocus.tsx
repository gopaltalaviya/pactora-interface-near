'use client';

import {usePathname} from 'next/navigation';
import {useEffect, useRef} from 'react';

/**
 * After a client-side navigation the browser leaves focus where it was — on
 * the link that was just pressed, in a header that did not change. A keyboard
 * or screen-reader user then reads on from the old place, into the old page.
 * A full page load would have started at the top; this does the same: on
 * every route change after the first, focus moves to the new page's h1 (or
 * the main landmark), without scrolling it into a different place.
 */
export function RouteFocus() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const target = document.querySelector<HTMLElement>('main h1') ?? document.getElementById('main');
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({preventScroll: true});
  }, [pathname]);
  return null;
}
