import type { ReactNode } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { Skeleton } from '@/components/ui/Skeleton';

/** The slice of `useAsync` a widget needs. Structural, so any caller fits. */
export interface WidgetState<T> {
  data: T | null;
  loading: boolean;
  refreshing?: boolean;
  error: string | null;
  refetch: () => void | Promise<void>;
}

/**
 * A dashboard card that owns its own loading, error and not-shipped states.
 *
 * Every widget fetches its own endpoint so one slow query degrades one card
 * instead of blanking the page — which only works if each card can render all
 * four outcomes on its own. That logic lives here once.
 *
 * `data === null` after loading means the endpoint answered 404: the contract
 * is agreed but the backend has not shipped it. That is "Not available yet",
 * not an error — the distinction is what lets the whole dashboard ship ahead
 * of the API.
 */
export function WidgetCard<T>({
  title,
  subtitle,
  action,
  state,
  rows = 4,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  state: WidgetState<T>;
  /** Skeleton lines to show while loading. Match the card's real density. */
  rows?: number;
  children: (data: T) => ReactNode;
}) {
  return (
    <Card className="widget-card">
      <CardHeader title={title} subtitle={subtitle} action={action} />
      <div className="widget-card__body" aria-busy={state.loading || undefined}>
        <WidgetBody state={state} rows={rows}>{children}</WidgetBody>
      </div>
    </Card>
  );
}

/** The same four states without the card chrome — for full-width sections. */
export function WidgetBody<T>({
  state,
  rows = 4,
  children,
}: {
  state: WidgetState<T>;
  rows?: number;
  children: (data: T) => ReactNode;
}) {
  if (state.loading) {
    return (
      <div className="widget-skeleton">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} width={index === 0 ? '55%' : '85%'} height={14} />
        ))}
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (state.error) return <ErrorState message={state.error} onRetry={() => void state.refetch()} />;

  if (state.data === null) {
    return (
      <EmptyState
        title="Not available yet"
        description="This part of the API has not shipped. The screen is built against the agreed contract and will fill in once the endpoint is live."
      />
    );
  }

  return <>{children(state.data)}</>;
}
