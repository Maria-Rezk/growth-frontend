import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import {
  demoDelay,
  demoLeadHistory,
  demoLeadNotes,
  demoLeads,
  demoUser,
  filterList,
  makeId,
  moveLeadStatus,
  pushNotification,
} from '@/services/demoStore';
import type { Lead, LeadNote, LeadStatus, LeadStatusHistory, ListParams } from '@/types/domain';

// ---------------------------------------------------------------------------
// Backend response normalizers (verified against Step 11 API tests).
// The live API uses different field names than the frontend types:
//   note    -> body      (lead notes)
//   userId  -> authorId  (lead notes)
// Status updates return an envelope: { lead, statusHistory }.
// Normalizing here keeps every page component unchanged.
// ---------------------------------------------------------------------------

type RawLeadNote = {
  id: string;
  companyId?: string;
  leadId: string;
  userId?: string;
  authorId?: string;
  note?: string;
  body?: string;
  createdAt?: string;
  author?: LeadNote['author'];
};

function normalizeLeadNote(raw: RawLeadNote): LeadNote {
  return {
    id: raw.id,
    leadId: raw.leadId,
    body: raw.note ?? raw.body ?? '',
    authorId: raw.userId ?? raw.authorId,
    author: raw.author,
    createdAt: raw.createdAt,
  };
}

type RawStatusHistory = {
  id: string;
  companyId?: string;
  leadId: string;
  fromStatus?: LeadStatus | null;
  toStatus: LeadStatus;
  changedById?: string;
  note?: string | null;
  createdAt?: string;
  changedBy?: LeadStatusHistory['changedBy'];
};

function normalizeStatusHistory(raw: RawStatusHistory): LeadStatusHistory {
  return {
    id: raw.id,
    leadId: raw.leadId,
    fromStatus: raw.fromStatus ?? undefined,
    toStatus: raw.toStatus,
    changedById: raw.changedById,
    changedBy: raw.changedBy,
    note: raw.note ?? undefined,
    createdAt: raw.createdAt,
  };
}

export const leadsService = {
  async list(companyId: string, params?: ListParams): Promise<Lead[]> {
    if (env.demoMode) return demoDelay(filterList(demoLeads.filter((lead) => lead.companyId === companyId), params));
    const response = await http.get(apiRoutes.leads.list(companyId), { params });
    // Backend returns { items, total, limit, offset }; unwrap extracts items.
    return unwrap<Lead[]>(response.data);
  },

  // Same as list, but preserves pagination metadata for components that need it.
  async listPaged(
    companyId: string,
    params?: ListParams & { limit?: number; offset?: number },
  ): Promise<{ items: Lead[]; total: number; limit: number; offset: number }> {
    if (env.demoMode) {
      const items = filterList(demoLeads.filter((lead) => lead.companyId === companyId), params);
      return demoDelay({ items, total: items.length, limit: params?.limit ?? 25, offset: params?.offset ?? 0 });
    }
    const response = await http.get(apiRoutes.leads.list(companyId), { params });
    const data = response.data as { items?: Lead[]; total?: number; limit?: number; offset?: number };
    return {
      items: data.items ?? [],
      total: data.total ?? data.items?.length ?? 0,
      limit: data.limit ?? params?.limit ?? 25,
      offset: data.offset ?? params?.offset ?? 0,
    };
  },

  /**
   * Per-status totals for the pipeline summary.
   *
   * Cannot be derived from the list response: that is filtered by the active
   * status and capped by the page size, so counting it makes every other tile
   * read zero the moment you filter, and under-reports past one page.
   *
   * One `limit=1` request per status reads the API's own `total` — seven tiny
   * parallel round-trips instead of one large one. `source` and `search` are
   * passed through so the tiles reflect the current search; `status` is
   * deliberately not, since that is what the tiles set.
   */
  async statusCounts(
    companyId: string,
    statuses: readonly LeadStatus[],
    params?: Omit<ListParams, 'status'>,
  ): Promise<Record<string, number>> {
    if (env.demoMode) {
      const all = filterList(demoLeads.filter((lead) => lead.companyId === companyId), params);
      return demoDelay(
        statuses.reduce<Record<string, number>>((acc, status) => {
          acc[status] = all.filter((lead) => lead.status === status).length;
          return acc;
        }, {}),
      );
    }

    const results = await Promise.all(
      statuses.map(async (status) => {
        const response = await http.get(apiRoutes.leads.list(companyId), {
          params: { ...params, status, limit: 1, offset: 0 },
        });
        const data = response.data as { items?: Lead[]; total?: number };
        return [status, data.total ?? data.items?.length ?? 0] as const;
      }),
    );

    return Object.fromEntries(results);
  },

  async get(companyId: string, leadId: string): Promise<Lead> {
    if (env.demoMode) {
      const lead = demoLeads.find((item) => item.companyId === companyId && item.id === leadId);
      if (!lead) throw new Error('Lead not found.');
      return demoDelay(lead);
    }
    const response = await http.get(apiRoutes.leads.detail(companyId, leadId));
    return unwrap<Lead>(response.data);
  },

  async create(companyId: string, payload: Partial<Lead>): Promise<Lead> {
    if (env.demoMode) {
      const lead: Lead = {
        id: makeId('lead'),
        companyId,
        name: payload.name ?? 'Untitled lead',
        email: payload.email,
        phone: payload.phone,
        source: payload.source,
        interestedService: payload.interestedService,
        notes: payload.notes,
        nextFollowUpAt: payload.nextFollowUpAt,
        status: payload.status ?? 'NEW',
        assignedToId: payload.assignedToId,
        assignedTo: payload.assignedTo,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      demoLeads.unshift(lead);
      pushNotification({ type: 'LEAD_ASSIGNED', title: 'New lead created', message: lead.name, readAt: null, relatedEntityType: 'LEAD', relatedEntityId: lead.id });
      return demoDelay(lead);
    }
    // Map to the backend create contract. No status on create.
    const body = {
      name: payload.name,
      email: payload.email || undefined,
      phone: payload.phone || undefined,
      source: payload.source,
      interestedService: payload.interestedService || undefined,
      notes: payload.notes || undefined,
      nextFollowUpAt: payload.nextFollowUpAt || undefined,
    };
    const response = await http.post(apiRoutes.leads.list(companyId), body);
    return unwrap<Lead>(response.data);
  },

  async update(companyId: string, leadId: string, payload: Partial<Lead>): Promise<Lead> {
    if (env.demoMode) {
      const lead = demoLeads.find((item) => item.companyId === companyId && item.id === leadId);
      if (!lead) throw new Error('Lead not found.');
      Object.assign(lead, payload, { updatedAt: new Date().toISOString() });
      return demoDelay(lead);
    }
    const response = await http.patch(apiRoutes.leads.detail(companyId, leadId), payload);
    return unwrap<Lead>(response.data);
  },

  // Verified backend contract: PATCH /status with { status, note }
  // returns { lead, statusHistory } — extract the lead for callers.
  async setStatus(companyId: string, leadId: string, status: LeadStatus, note?: string): Promise<Lead> {
    if (env.demoMode) {
      const lead = moveLeadStatus(leadId, status);
      pushNotification({ type: 'LEAD_STATUS_CHANGED', title: 'Lead status changed', message: `${lead.name} moved to ${status}`, readAt: null, relatedEntityType: 'LEAD', relatedEntityId: leadId });
      return demoDelay(lead);
    }
    const response = await http.patch(apiRoutes.leads.status(companyId, leadId), { status, note: note || undefined });
    const envelope = unwrap<Record<string, unknown>>(response.data);
    if (envelope && typeof envelope === 'object' && 'lead' in envelope && envelope.lead) {
      return envelope.lead as Lead;
    }
    return envelope as unknown as Lead;
  },

  async notes(companyId: string, leadId: string): Promise<LeadNote[]> {
    if (env.demoMode) return demoDelay(demoLeadNotes.filter((note) => note.leadId === leadId));
    const response = await http.get(apiRoutes.leads.notes(companyId, leadId));
    const raw = unwrap<RawLeadNote[]>(response.data);
    return (Array.isArray(raw) ? raw : []).map(normalizeLeadNote);
  },

  async addNote(companyId: string, leadId: string, note: string): Promise<LeadNote> {
    if (env.demoMode) {
      const created: LeadNote = { id: makeId('lead-note'), leadId, body: note, authorId: demoUser.id, author: demoUser, createdAt: new Date().toISOString() };
      demoLeadNotes.unshift(created);
      return demoDelay(created);
    }
    const response = await http.post(apiRoutes.leads.notes(companyId, leadId), { note });
    return normalizeLeadNote(unwrap<RawLeadNote>(response.data));
  },

  async statusHistory(companyId: string, leadId: string): Promise<LeadStatusHistory[]> {
    if (env.demoMode) return demoDelay(demoLeadHistory.filter((history) => history.leadId === leadId));
    const response = await http.get(apiRoutes.leads.statusHistory(companyId, leadId));
    const raw = unwrap<RawStatusHistory[]>(response.data);
    return (Array.isArray(raw) ? raw : []).map(normalizeStatusHistory);
  },
};