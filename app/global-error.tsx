'use client';

import './globals.css';

/**
 * The root layout itself threw, so there is no layout to render inside: this
 * replaces the whole document and must bring its own <html> and <body>.
 */
export default function GlobalError({reset}: {error: Error & {digest?: string}; reset: () => void}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink text-text">
        <main role="alert" className="mx-auto max-w-2xl space-y-4 px-6 py-16">
          <h1 className="text-xl font-semibold">Pactora failed to load</h1>
          <p className="text-sm text-muted">Nothing was spent and nothing was signed.</p>
          <button
            type="button"
            onClick={reset}
            className="h-10 rounded-lg bg-accent px-4 text-sm font-medium text-ink transition-transform active:scale-[0.97]"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
