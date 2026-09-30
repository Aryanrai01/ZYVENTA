/** Placeholder with the form's shape while client-side search params resolve. */
export function AuthFormSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <div className="h-8 w-2/3 rounded-md bg-muted" />
        <div className="h-4 w-1/2 rounded-md bg-muted" />
      </div>
      <div className="space-y-5">
        <div className="h-11 rounded-md bg-muted" />
        <div className="h-11 rounded-md bg-muted" />
        <div className="h-11 rounded-md bg-muted" />
      </div>
    </div>
  );
}
