'use client';

import {useEffect} from 'react';
import {usePathname} from 'next/navigation';

/**
 * A docs table wider than a phone scrolls inside itself (globals.css). A
 * region that scrolls must be reachable by keyboard, or a keyboard user cannot
 * read its right-hand columns (WCAG 2.1.1; axe "scrollable-region-focusable").
 * Only tables that actually overflow get a tab stop — on a desktop, none do.
 *
 * Attributes only: React owns these nodes, so nothing is moved or wrapped.
 */
export function ScrollableTables() {
  const path = usePathname();
  useEffect(() => {
    const mark = () => {
      for (const table of document.querySelectorAll<HTMLTableElement>('.prose-doc table')) {
        const scrolls = table.scrollWidth > table.clientWidth + 1;
        if (scrolls) {
          table.tabIndex = 0;
          const head = table.querySelector('th')?.textContent?.trim();
          table.setAttribute(
            'aria-label',
            head ? `Table: ${head} … (scrolls sideways)` : 'Table (scrolls sideways)',
          );
        } else if (table.hasAttribute('tabindex')) {
          table.removeAttribute('tabindex');
          table.removeAttribute('aria-label');
        }
      }
    };
    mark();
    window.addEventListener('resize', mark);
    return () => window.removeEventListener('resize', mark);
  }, [path]);
  return null;
}
