import { LeadStatus, type Lead } from '@/types/domain';

/*
  The CRM's clock: when does this lead need touching next?

  A lead with a follow-up date in the past is overdue; without one, and
  still open, it is adrift — nobody has said when to call. Both are things
  a Sales Agent must see without opening the record.
*/

export type FollowUpBucket = 'overdue' | 'today' | 'week' | 'later' | 'none';

export const CLOSED_LEAD_STATUSES: readonly LeadStatus[] = [LeadStatus.WON, LeadStatus.LOST];

export function isOpenLead(lead: Pick<Lead, 'status'>): boolean {
  return !CLOSED_LEAD_STATUSES.includes(lead.status);
}

export function followUpBucket(lead: Pick<Lead, 'nextFollowUpAt' | 'status'>, now: number = Date.now()): FollowUpBucket {
  if (!isOpenLead(lead)) return 'none';
  if (!lead.nextFollowUpAt) return 'none';
  const time = new Date(lead.nextFollowUpAt).getTime();
  if (!Number.isFinite(time)) return 'none';
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  if (time < now) return 'overdue';
  if (time <= endOfToday.getTime()) return 'today';
  if (time <= now + 7 * 24 * 3_600_000) return 'week';
  return 'later';
}

/** Open, with no follow-up date at all — the lead nobody has scheduled. */
export function isAdrift(lead: Pick<Lead, 'nextFollowUpAt' | 'status'>): boolean {
  return isOpenLead(lead) && !lead.nextFollowUpAt;
}

/** A sensible default for the next touch after a status change: two working-ish days out, 10:00. */
export function suggestNextFollowUp(status: LeadStatus, now: Date = new Date()): string | undefined {
  if (CLOSED_LEAD_STATUSES.includes(status)) return undefined;
  const days = status === LeadStatus.FOLLOW_UP_LATER ? 14 : status === LeadStatus.WAITING_DECISION ? 3 : 2;
  const next = new Date(now);
  next.setDate(next.getDate() + days);
  next.setHours(10, 0, 0, 0);
  return next.toISOString();
}

/** Why a lead was lost. Stored as a prefix on the status note until the backend has a field. */
export const LOST_REASONS = ['Price', 'Timing', 'Went elsewhere', 'No response', 'Not a fit', 'Other'] as const;
export type LostReason = (typeof LOST_REASONS)[number];

/** Tap-to-contact links. WhatsApp needs digits only; the rest are the standard schemes. */
export function contactLinks(lead: Pick<Lead, 'email' | 'phone'>): { email?: string; phone?: string; whatsapp?: string } {
  const digits = lead.phone?.replace(/[^\d]/g, '') ?? '';
  return {
    email: lead.email ? `mailto:${lead.email}` : undefined,
    phone: lead.phone ? `tel:${lead.phone.replace(/[^\d+]/g, '')}` : undefined,
    whatsapp: digits.length >= 8 ? `https://wa.me/${digits}` : undefined,
  };
}

/** True when two leads look like the same person: same email, or same phone digits. */
export function looksLikeDuplicate(candidate: { email?: string; phone?: string }, existing: Pick<Lead, 'email' | 'phone'>): boolean {
  const email = candidate.email?.trim().toLowerCase();
  const phone = candidate.phone?.replace(/[^\d]/g, '');
  if (email && existing.email && existing.email.toLowerCase() === email) return true;
  if (phone && phone.length >= 7 && existing.phone && existing.phone.replace(/[^\d]/g, '') === phone) return true;
  return false;
}
