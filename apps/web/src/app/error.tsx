'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/** Route-level error boundary. Shows a retry instead of a blank screen; never renders error details. */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center"
    >
      <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
      <p className="mt-3 text-muted-foreground">
        We couldn’t load this page. Please try again.
        {error.digest ? (
          <span className="mt-2 block text-xs">Reference: {error.digest}</span>
        ) : null}
      </p>
      <Button className="mt-8" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
