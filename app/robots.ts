import type {MetadataRoute} from 'next';
import {siteUrl} from '@/lib/site';

/** Every page is public; the sitemap is on this deployment's own origin. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {userAgent: '*', allow: '/'},
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
