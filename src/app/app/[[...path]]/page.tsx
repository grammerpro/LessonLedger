import { Workspace } from '@/components/workspace';
import { Suspense } from 'react';
export default function AppPage() {
  return (
    <Suspense
      fallback={
        <main id="main" className="app-loading">
          Opening your workspace…
        </main>
      }
    >
      <Workspace />
    </Suspense>
  );
}
