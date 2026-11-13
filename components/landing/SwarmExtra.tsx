import Link from 'next/link';
import {Icon} from '@/components/ui/Icon';
import {SWARM_SETTLED} from '@/lib/figures';

/**
 * The recorded swarm run's settlements, beside the live figures and apart from
 * them: a separate run on the same testnet contract, not in this site's count.
 */
export function SwarmExtra({className = ''}: {className?: string}) {
  return (
    <p className={`text-xs text-muted ${className}`} data-testid="swarm-extra">
      + {SWARM_SETTLED} more settled in the recorded swarm run, a separate run on the same contract.{' '}
      <Link href="/swarm" className="inline-flex min-h-6 items-center gap-1 text-accent hover:underline">
        Open the swarm run <Icon name="arrowRight" className="size-3" />
      </Link>
    </p>
  );
}
