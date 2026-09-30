'use client';

import { useMutation } from '@tanstack/react-query';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiClientError } from '@/lib/api-client';
import { authService } from '@/services/auth.service';

export function EmailVerificationBanner({ email }: { email: string }) {
  const resend = useMutation({ mutationFn: authService.resendVerification });

  return (
    <Alert variant="warning" title="Confirm your email address">
      <p>
        We sent a link to <span className="font-medium text-foreground">{email}</span>. You’ll need
        to confirm it before checking out.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          loading={resend.isPending}
          disabled={resend.isSuccess}
          onClick={() => {
            resend.mutate();
          }}
        >
          {resend.isSuccess ? 'Email sent' : 'Resend email'}
        </Button>
        {resend.isError ? (
          <span className="text-sm text-destructive" role="alert">
            {resend.error instanceof ApiClientError
              ? resend.error.message
              : 'Could not send the email.'}
          </span>
        ) : null}
      </div>
    </Alert>
  );
}
