import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { humanize } from '@/utils/format';

const TONES: Record<string, BadgeTone> = {
  DRAFT: 'neutral',
  TODO: 'neutral',
  NEW: 'neutral',
  IN_PROGRESS: 'info',
  IN_INTERNAL_REVIEW: 'info',
  IN_REVIEW: 'info',
  READY_FOR_CLIENT: 'warning',
  CHANGES_REQUESTED: 'warning',
  FOLLOW_UP_LATER: 'warning',
  WAITING_DECISION: 'warning',
  CONTACTED: 'info',
  INTERESTED: 'accent',
  APPROVED: 'success',
  WON: 'success',
  SCHEDULED: 'accent',
  PUBLISHED: 'success',
  DONE: 'success',
  LOST: 'danger',
  REJECTED: 'danger',
  CANCELED: 'danger',
  BLOCKED: 'danger',
  HIGH: 'warning',
  URGENT: 'danger',
  MEDIUM: 'info',
  LOW: 'neutral',
};

export function StatusBadge({ value }: { value?: string }) {
  return <Badge tone={value ? TONES[value] ?? 'neutral' : 'neutral'}>{humanize(value)}</Badge>;
}
