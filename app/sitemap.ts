import type {MetadataRoute} from 'next';
import {NOINDEX_ROUTES, PUBLIC_ROUTES, siteUrl} from '@/lib/site';

/**
 * The public pages, from one list (lib/site.ts), minus the ones that say
 * noindex. Agent profiles, run records, jobs and listings are left out: they
 * are reached by id, and there is no list of every id to give a crawler.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return PUBLIC_ROUTES.filter((route) => !NOINDEX_ROUTES.includes(route)).map((route) => ({
    url: route === '/' ? `${base}/` : `${base}${route}`,
  }));
}
