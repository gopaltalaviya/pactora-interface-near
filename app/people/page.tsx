import {Suspense} from 'react';
import {Skeleton} from '@/components/ui/States';
import {DirectoryView} from './DirectoryView';

export default function PeoplePage() {
  // useSearchParams (the ?q= search) needs a Suspense boundary.
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <DirectoryView />
    </Suspense>
  );
}
