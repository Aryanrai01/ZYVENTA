'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiClientError } from '@/lib/api-client';
import { authService } from '@/services/auth.service';
import { authKeys } from '../use-auth';
import { AuthHeading } from './auth-heading';

type State = { kind: 'verifying' } | { kind: 'done' } | { kind: 'failed'; message: string };

export function VerifyEmail() {
  const token = useSearchParams().get('token') ?? '';
  const queryClient = useQueryClient();
  const [state, setState] = useState<State>(
    token ? { kind: 'verifying' } : { kind: 'failed', message: 'This link is incomplete.' },
  );
  const started = useRef(false);

  useEffect(() => {
    // Strict Mode runs effects twice in development; the token is single-use.
    if (!token || started.current) return;
    started.current = true;
    authService
      .verifyEmail(token)
      .then(() => {
        setState({ kind: 'done' });
        void queryClient.invalidateQueries({ queryKey: authKeys.me });
      })
      .catch((error: unknown) => {
        setState({
          kind: 'failed',
          message:
            error instanceof ApiClientError
              ? error.message
              : 'We couldn’t verify your email. Please try again.',
        });
      });
  }, [token, queryClient]);

  if (state.kind === 'verifying') {
    return (
      <div className="flex items-center gap-3" role="status">
        <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
        <p>Confirming your email address…</p>
      </div>
    );
  }

  if (state.kind === 'done') {
    return (
      <>
        <AuthHeading title="Email confirmed" />
        <Alert variant="success">Thanks! Your email address is verified.</Alert>
        <Button asChild size="lg" fullWidth className="mt-6">
          <Link href="/">Start shopping</Link>
        </Button>
      </>
    );
  }

  return (
    <>
      <AuthHeading title="We couldn’t confirm your email" />
      <Alert variant="error">{state.message}</Alert>
      <p className="mt-6 text-sm text-muted-foreground">
        You can request a new link from your{' '}
        <Link href="/account" className="font-medium text-primary hover:underline">
          account page
        </Link>
        .
      </p>
    </>
  );
}
