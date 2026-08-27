import type { ComponentType, SVGProps } from 'react';
import { AlertIcon, CampaignIcon, ClockIcon, LeadIcon, PostIcon, TaskIcon } from '@/components/ui/icons';
import { formatAgeMinutes, humanize } from '@/utils/format';
import type { BadgeTone } from '@/components/ui/Badge';
import type { AttentionItem, Severity } from '@/types/domain';

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

/** Which client-workspace screen a row opens. */
type AttentionEntity = 'TASK' | 'POST' | 'LEAD' | 'CAMPAIGN';

interface AttentionMeta {
  entity: AttentionEntity;
  icon: Icon;
  /** Short reason line under the title. */
  reason: (item: AttentionItem) => string;
}

/**
 * `AttentionItem.type` is an OPEN set — the backend adds new ones as it grows.
 *
 * Anything missing from this map still renders, as a generic row carrying its
 * own title (see `attentionMeta`). Dropping unknown types would silently hide
 * work from the one feed people actually work from.
 */
const META: Record<string, AttentionMeta> = {
  TASK_OVERDUE: {
    entity: 'TASK',
    icon: AlertIcon,
    reason: (item) => `Overdue · ${formatAgeMinutes(item.ageMinutes)} late`,
  },
  TASK_BLOCKED: { entity: 'TASK', icon: AlertIcon, reason: () => 'Blocked' },
  TASK_UNASSIGNED_URGENT: { entity: 'TASK', icon: TaskIcon, reason: () => 'Urgent, nobody assigned' },
  PUBLISHING_DUE: {
    entity: 'POST',
    icon: ClockIcon,
    reason: () => 'Scheduled time passed — publish manually',
  },
  APPROVAL_WAITING_TOO_LONG: {
    entity: 'POST',
    icon: ClockIcon,
    reason: (item) => `Waiting on client · ${formatAgeMinutes(item.ageMinutes)}`,
  },
  CHANGES_REQUESTED_STALE: { entity: 'POST', icon: PostIcon, reason: () => 'Changes requested, no action' },
  LEAD_FOLLOW_UP_OVERDUE: { entity: 'LEAD', icon: LeadIcon, reason: () => 'Follow-up overdue' },
  CAMPAIGN_ENDING_INCOMPLETE: { entity: 'CAMPAIGN', icon: CampaignIcon, reason: () => 'Ends soon, work outstanding' },
};

const ENTITY_PATH: Record<AttentionEntity, (entityId: string) => string> = {
  TASK: (id) => `/tasks/${id}`,
  POST: (id) => `/posts/${id}`,
  LEAD: (id) => `/leads/${id}`,
  // No campaign detail route exists yet; the list is the closest landing spot.
  CAMPAIGN: () => '/campaigns',
};

export interface ResolvedAttention {
  icon: Icon;
  reason: string;
  /** Path inside the item's client workspace, or null for an unknown type. */
  path: string | null;
}

export function attentionMeta(item: AttentionItem): ResolvedAttention {
  const meta = META[item.type];
  if (!meta) {
    // Unknown type: readable label from the raw string, no route to guess at.
    return { icon: AlertIcon, reason: humanize(item.type), path: null };
  }
  return {
    icon: meta.icon,
    reason: meta.reason(item),
    path: ENTITY_PATH[meta.entity](item.entityId),
  };
}

export const SEVERITY_TONE: Record<Severity, BadgeTone> = {
  CRITICAL: 'danger',
  WARNING: 'warning',
  INFO: 'info',
};

/** Severity is an open set too — anything unrecognised reads as neutral. */
export function severityTone(severity: string): BadgeTone {
  return SEVERITY_TONE[severity as Severity] ?? 'neutral';
}
