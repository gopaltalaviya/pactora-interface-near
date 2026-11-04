import type {MetadataRoute} from 'next';
import {PUBLIC_ROUTES, siteUrl} from '@/lib/site';

/**
 * The public pages, from one list (lib/site.ts). Agent profiles and run
 * records are left out: they are reached by id, and there is no list of every
 * id to give a crawler.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return PUBLIC_ROUTES.map((route) => ({url: route === '/' ? `${base}/` : `${base}${route}`}));
}
