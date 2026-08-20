import { FormEvent, useMemo, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Field, Input } from '@/components/ui/Fields';
import { EmptyState } from '@/components/ui/State';
import {
  COMMITMENT_ITEMS,
  commitmentState,
  commitmentsService,
  deliveredFor,
  EMPTY_COMMITMENT,
  isCommitmentSet,
  monthProgress,
  type CommitmentKey,
  type CommitmentState,
  type MonthlyCommitment,
} from '@/services/commitments';
import type { ReportOverview } from '@/types/domain';

const STATE_TONE: Record<CommitmentState, BadgeTone> = {
  complete: 'success',
  'on-track': 'info',
  behind: 'warning',
  'not-started': 'danger',
};

const STATE_LABEL: Record<CommitmentState, string> = {
  complete: 'Complete',
  'on-track': 'On track',
  behind: 'Behind',
  'not-started': 'Not started',
};

/**
 * Commitment vs delivered for one client and one period.
 *
 * This is the difference between a tracking system and a management tool: the
 * numbers above this panel say what happened, this one says whether what
 * happened is enough. Pacing matters as much as the totals — 6 of 12 posts is
 * fine on the 15th and a problem on the 28th — so every line is judged
 * against how much of the month has actually elapsed.
 */
export function CommitmentPanel({
  companyId,
  companyName,
  month,
  year,
  overview,
  overviewLoading,
  reportsInPeriod,
}: {
  companyId: string;
  companyName: string;
  month: number;
  year: number;
  overview: ReportOverview | null;
  overviewLoading: boolean;
  reportsInPeriod: number;
}) {
  const [commitment, setCommitment] = useState<MonthlyCommitment>(() => commitmentsService.get(companyId));
  const [editing, setEditing] = useState(false);

  // A different client is a different commitment — reload rather than showing
  // the previous client's promise against this client's delivery.
  const [loadedFor, setLoadedFor] = useState(companyId);
  if (loadedFor !== companyId) {
    setLoadedFor(companyId);
    setCommitment(commitmentsService.get(companyId));
    setEditing(false);
  }

  const progress = useMemo(() => monthProgress(month, year), [month, year]);

  const rows = useMemo(
    () =>
      COMMITMENT_ITEMS.filter((item) => commitment[item.key] > 0).map((item) => {
        const target = commitment[item.key];
        const delivered = deliveredFor(item.key, overview, reportsInPeriod);
        return {
          ...item,
          target,
          delivered,
          gap: Math.max(target - delivered, 0),
          state: commitmentState(target, delivered, progress),
        };
      }),
    [commitment, overview, progress, reportsInPeriod],
  );

  const behindRows = rows.filter((row) => row.state === 'behind' || row.state === 'not-started');
  const set = isCommitmentSet(commitment);

  if (editing || !set) {
    return (
      <CommitmentForm
        companyId={companyId}
        initial={set ? commitment : EMPTY_COMMITMENT}
        showCancel={set}
        onCancel={() => setEditing(false)}
        onSaved={(saved) => {
          setCommitment(saved);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <Card>
      <CardHeader
        title="Commitment vs delivered"
        subtitle={`What we promised ${companyName} this month, against what has shipped.`}
        action={<Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Edit commitment</Button>}
      />
      <div className="content-card__body">
        <p className={clsx('commitment-verdict', behindRows.length ? 'commitment-verdict--behind' : 'commitment-verdict--ok')}>
          {overviewLoading
            ? 'Checking delivery…'
            : behindRows.length
              ? `Behind on ${companyName}: ${behindRows.map((row) => row.label.toLowerCase()).join(', ')}.`
              : `On track with ${companyName} for this period.`}
        </p>
        <p className="muted">{elapsedLabel(progress, month, year)}</p>

        <ul className="commitment-list">
          {rows.map((row) => (
            <li className="commitment-row" key={row.key}>
              <div className="commitment-row__head">
                <strong>{row.label}</strong>
                <span className="commitment-row__count">
                  {overviewLoading ? '—' : row.delivered} / {row.target}
                </span>
                <Badge tone={STATE_TONE[row.state]}>
                  {row.state === 'behind' && row.gap ? `Short by ${row.gap}` : STATE_LABEL[row.state]}
                </Badge>
              </div>
              <CommitmentBar delivered={row.delivered} target={row.target} progress={progress} state={row.state} />
              <p className="muted">{row.hint}</p>
            </li>
          ))}
        </ul>

        <p className="field__hint">
          Stored in this browser for now. The commitment belongs on the client record in the API — once that
          field exists, this panel reads it instead and every teammate sees the same numbers.
        </p>
      </div>
    </Card>
  );
}

function elapsedLabel(progress: number, month: number, year: number): string {
  if (progress <= 0) return `${month}/${year} has not started yet — nothing is due.`;
  if (progress >= 1) return `${month}/${year} is closed — these are final numbers.`;
  const daysInMonth = new Date(year, month, 0).getDate();
  return `Day ${new Date().getDate()} of ${daysInMonth} — ${Math.round(progress * 100)}% of the month has passed.`;
}

/** Delivered as a filled bar, with a marker where the month's pace sits. */
function CommitmentBar({
  delivered,
  target,
  progress,
  state,
}: {
  delivered: number;
  target: number;
  progress: number;
  state: CommitmentState;
}) {
  const filled = target > 0 ? Math.min(delivered / target, 1) : 0;
  return (
    <div className="commitment-bar" role="presentation">
      <div className={clsx('commitment-bar__fill', `commitment-bar__fill--${state}`)} style={{ width: `${filled * 100}%` }} />
      {progress > 0 && progress < 1 ? (
        <span className="commitment-bar__pace" style={{ insetInlineStart: `${progress * 100}%` }} aria-hidden="true" />
      ) : null}
    </div>
  );
}

function CommitmentForm({
  companyId,
  initial,
  showCancel,
  onCancel,
  onSaved,
}: {
  companyId: string;
  initial: MonthlyCommitment;
  showCancel: boolean;
  onCancel: () => void;
  onSaved: (commitment: MonthlyCommitment) => void;
}) {
  const [draft, setDraft] = useState<MonthlyCommitment>(initial);

  const update = (key: CommitmentKey, value: string) => {
    setDraft((current) => ({ ...current, [key]: Number(value) || 0 }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const saved = commitmentsService.save(companyId, draft);
    if (!isCommitmentSet(saved)) {
      commitmentsService.clear(companyId);
    }
    toast.success('Monthly commitment saved.');
    onSaved(saved);
  };

  return (
    <Card>
      <CardHeader
        title="Monthly commitment"
        subtitle="How much of each deliverable this client is owed per month. Leave a line at zero to leave it out."
      />
      <div className="content-card__body">
        {!showCancel ? (
          <EmptyState
            title="No commitment set for this client"
            description="Without it a report can only count what happened — it cannot tell you whether you are behind."
          />
        ) : null}
        <form className="form-grid" onSubmit={submit}>
          <div className="commitment-fields">
            {COMMITMENT_ITEMS.map((item) => (
              <Field key={item.key} label={item.label} htmlFor={`commitment-${item.key}`}>
                <Input
                  id={`commitment-${item.key}`}
                  type="number"
                  min={0}
                  value={draft[item.key]}
                  onChange={(event) => update(item.key, event.target.value)}
                />
              </Field>
            ))}
          </div>
          <div className="form-actions">
            {showCancel ? <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button> : null}
            <Button type="submit">Save commitment</Button>
          </div>
        </form>
      </div>
    </Card>
  );
}
