/* The history column of AI Studio: every generation for this client, newest first. */
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/State';
import { type AiGeneration } from '@/services/ai';
import { GenerationCard } from '@/components/domain/ai/GenerationCard';

export function GenerationsList({
  loading,
  refreshing,
  error,
  data,
  onRetry,
  companyId,
  canApply,
}: {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  data: AiGeneration[] | null;
  onRetry: () => void;
  companyId: string;
  canApply: boolean;
}) {
  if (loading) return <Card><LoadingState label="Loading generations…" /></Card>;
  if (error) return <Card><ErrorState message={error} onRetry={onRetry} /></Card>;

  if (!data?.length) {
    return (
      <Card>
        <EmptyState title="No AI drafts yet" description="Generate a content plan, captions or post ideas above." />
      </Card>
    );
  }

  return (
    <div className="stack-list">
      {refreshing ? <p className="muted" aria-live="polite">Updating…</p> : null}
      {data.map((generation) => (
        <GenerationCard key={generation.id} companyId={companyId} generation={generation} canApply={canApply} />
      ))}
    </div>
  );
}

/* ---------- Output rendering ---------- */
