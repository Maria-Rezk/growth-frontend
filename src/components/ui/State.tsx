import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state" role="status">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state state--error" role="alert">
      <strong>Couldn’t load this data</strong>
      <p>{message}</p>
      {onRetry ? (
        <div className="state__action">
          <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>
        </div>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="state state--empty">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action ? <div className="state__action">{action}</div> : null}
    </div>
  );
}
