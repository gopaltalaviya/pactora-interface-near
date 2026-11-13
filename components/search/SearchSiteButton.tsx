'use client';

import {Button} from '@/components/ui/Button';
import {Icon} from '@/components/ui/Icon';
import {openSearch} from './events';

/** Opens the site search from a page body (the 404 page), as a full-size button. */
export function SearchSiteButton() {
  return (
    <Button variant="secondary" onClick={openSearch}>
      <Icon name="search" className="size-4" /> Search the site
    </Button>
  );
}
