'use client';

import {useEffect} from 'react';
import {Button, ButtonLink} from '@/components/ui/Button';
import {Icon} from '@/components/ui/Icon';

/**
 * A page that threw.
 *
 * Without this boundary a render error blanks the whole app, header and all —
 * and the header carries the network badge, the one fact a viewer must never
 * lose. This keeps the frame and offers a retry, because most failures here
 * are an API that was briefly unreachable.
 */
export default function PageError({error, reset}: {error: Error & {digest?: string}; reset: () => void}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-lg flex-col items-center gap-5 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full border border-broken/40 bg-broken/10 text-broken">
        <Icon name="alert" className="size-6" />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">This page failed to load</h1>
      <p className="text-sm leading-relaxed text-muted">
        Nothing was spent and nothing was signed — this page only reads. The usual cause is the API being
        unreachable for a moment.
        {error.digest ? (
          <>
            {' '}
            Reference <code className="tabular">{error.digest}</code>.
          </>
        ) : null}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>
          <Icon name="refresh" /> Try again
        </Button>
        <ButtonLink href="/">Back to the demo</ButtonLink>
        <ButtonLink href="/status" variant="ghost">
          Check status
        </ButtonLink>
      </div>
    </div>
  );
}
