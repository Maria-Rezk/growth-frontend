import type { ReactNode } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/Card';

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

/**
 * A record that does not exist — deleted, or a wrong link. Not an error state:
 * retrying cannot bring it back, so this offers the way back to its list
 * instead, with a real page heading and tab title.
 */
export function RecordNotFound({ title, backTo, backLabel }: { title: string; backTo: string; backLabel: string }) {
  return (
    <>
      <PageHeader title={title} subtitle="It may have been deleted, or the link may be wrong." />
      <div className="button-row">
        <ButtonLink to={backTo} variant="secondary">{backLabel}</ButtonLink>
      </div>
    </>
  );
}
