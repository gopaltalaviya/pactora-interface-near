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
      // 3 s, not 1.5: from the hosting region the API can take longer, and a
      // refresh that times out leaves the old value cached, so a renamed
      // profile kept its old title for hours (live test, 2026-11-13).
      signal: AbortSignal.timeout(3_000),
      next: {revalidate: 30},
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}
