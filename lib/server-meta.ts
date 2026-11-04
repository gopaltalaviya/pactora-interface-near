import 'server-only';
import {API_URL} from './api';

/**
 * A read for `generateMetadata` only: a link preview that names the agent or
 * the goal is worth one quick request, and a page that fails to render
 * because that request was slow is not. So it times out fast, is cached
 * briefly, and any failure yields null — the page then uses a generic title.
 */
export async function readForMetadata<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      signal: AbortSignal.timeout(1_500),
      next: {revalidate: 60},
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}
