import {Suspense} from 'react';
import {Skeleton} from '@/components/ui/States';
import {BoardView} from './BoardView';

export default function JobsPage() {
  // useSearchParams (the ?q= search) needs a Suspense boundary.
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <BoardView />
    </Suspense>
  );
}
