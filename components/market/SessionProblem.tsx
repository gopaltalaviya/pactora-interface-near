'use client';

import {useState} from 'react';
import {Button} from '@/components/ui/Button';
import {ErrorState} from '@/components/ui/States';
import {useSession} from '@/lib/session';

/**
 * Signed in, but the person record could not be read (the API was
 * unreachable or failed). "No record" and "could not ask" are different: this
 * says the second, with a retry, and never offers to join.
 */
export function SessionProblem() {
  const {personError, retry} = useSession();
  const [busy, setBusy] = useState(false);
  if (!personError) return null;
  return (
    <div data-testid="session-problem">
      <ErrorState
        title="Could not read your account"
        action={
          <Button
            icon="refresh"
            variant="secondary"
            size="sm"
            loading={busy}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void retry().finally(() => setBusy(false));
            }}
          >
            Retry
          </Button>
        }
      >
        {personError}
      </ErrorState>
    </div>
  );
}
