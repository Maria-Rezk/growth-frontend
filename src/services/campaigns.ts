import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import {
  buildCampaignMetrics,
  demoCampaigns,
  demoDelay,
  makeId,
} from '@/services/demoStore';
import type {
  Campaign,
  CampaignObjective,
  CampaignOverview,
  CampaignStatus,
} from '@/types/domain';

type CampaignListParams = { status?: string; search?: string };

type CampaignCreateInput = {
  name: string;
  objective: CampaignObjective;
  description?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;        // sent as number; API returns it as a string
  currency?: string;
  targetAudience?: string;
  notes?: string;
};

type CampaignUpdateInput = {
  name?: string;
  objective?: CampaignObjective;
  description?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  currency?: string;
  targetAudience?: string;
  notes?: string;
};

export const campaignsService = {
  async list(companyId: string, params?: CampaignListParams): Promise<Campaign[]> {
    if (env.demoMode) {
      let items = demoCampaigns.filter((c) => c.companyId === companyId);
      if (params?.status) items = items.filter((c) => c.status === params.status);
      if (params?.search) {
        const q = params.search.toLowerCase();
        items = items.filter((c) => c.name.toLowerCase().includes(q));
      }
      return demoDelay(items);
    }
    const response = await http.get(apiRoutes.campaigns.list(companyId), { params });
    return unwrap<Campaign[]>(response.data);
  },

  async get(companyId: string, campaignId: string): Promise<Campaign> {
    if (env.demoMode) {
      const campaign = demoCampaigns.find((c) => c.companyId === companyId && c.id === campaignId);
      if (!campaign) throw new Error('Campaign not found.');
      return demoDelay(campaign);
    }
    const response = await http.get(apiRoutes.campaigns.detail(companyId, campaignId));
    return unwrap<Campaign>(response.data);
  },

  async create(companyId: string, payload: CampaignCreateInput): Promise<Campaign> {
    if (env.demoMode) {
      const campaign: Campaign = {
        id: makeId('campaign'),
        companyId,
        name: payload.name,
        objective: payload.objective,
        status: 'DRAFT',
        description: payload.description,
        startDate: payload.startDate,
        endDate: payload.endDate,
        budget: payload.budget != null ? payload.budget.toFixed(2) : undefined,
        currency: payload.currency,
        targetAudience: payload.targetAudience,
        notes: payload.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      demoCampaigns.unshift(campaign);
      return demoDelay(campaign);
    }
    // No status on create — backend assigns DRAFT.
    const response = await http.post(apiRoutes.campaigns.list(companyId), payload);
    return unwrap<Campaign>(response.data);
  },

  async update(companyId: string, campaignId: string, payload: CampaignUpdateInput): Promise<Campaign> {
    if (env.demoMode) {
      const campaign = demoCampaigns.find((c) => c.companyId === companyId && c.id === campaignId);
      if (!campaign) throw new Error('Campaign not found.');
      Object.assign(campaign, payload, {
        budget: payload.budget != null ? payload.budget.toFixed(2) : campaign.budget,
        updatedAt: new Date().toISOString(),
      });
      return demoDelay(campaign);
    }
    const response = await http.patch(apiRoutes.campaigns.detail(companyId, campaignId), payload);
    return unwrap<Campaign>(response.data);
  },

  async setStatus(companyId: string, campaignId: string, status: CampaignStatus): Promise<Campaign> {
    if (env.demoMode) {
      const campaign = demoCampaigns.find((c) => c.companyId === companyId && c.id === campaignId);
      if (!campaign) throw new Error('Campaign not found.');
      campaign.status = status;
      campaign.updatedAt = new Date().toISOString();
      return demoDelay(campaign);
    }
    const response = await http.patch(apiRoutes.campaigns.status(companyId, campaignId), { status });
    return unwrap<Campaign>(response.data);
  },

  async overview(companyId: string, campaignId: string): Promise<CampaignOverview> {
    if (env.demoMode) {
      const campaign = demoCampaigns.find((c) => c.companyId === companyId && c.id === campaignId);
      if (!campaign) throw new Error('Campaign not found.');
      return demoDelay({ campaign, metrics: buildCampaignMetrics() });
    }
    // Response is { campaign, metrics } — a custom wrapper unwrap() doesn't
    // recognize, so read response.data directly.
    const response = await http.get(apiRoutes.campaigns.overview(companyId, campaignId));
    return response.data as CampaignOverview;
  },

  // --- Links (attach = POST, detach = DELETE on the same path) ---

  async attachPost(companyId: string, campaignId: string, postId: string): Promise<void> {
    if (env.demoMode) return demoDelay(undefined);
    await http.post(apiRoutes.campaigns.post(companyId, campaignId, postId));
  },
  async detachPost(companyId: string, campaignId: string, postId: string): Promise<void> {
    if (env.demoMode) return demoDelay(undefined);
    await http.delete(apiRoutes.campaigns.post(companyId, campaignId, postId));
  },

  async attachLead(companyId: string, campaignId: string, leadId: string): Promise<void> {
    if (env.demoMode) return demoDelay(undefined);
    await http.post(apiRoutes.campaigns.lead(companyId, campaignId, leadId));
  },
  async detachLead(companyId: string, campaignId: string, leadId: string): Promise<void> {
    if (env.demoMode) return demoDelay(undefined);
    await http.delete(apiRoutes.campaigns.lead(companyId, campaignId, leadId));
  },

  async attachTask(companyId: string, campaignId: string, taskId: string): Promise<void> {
    if (env.demoMode) return demoDelay(undefined);
    await http.post(apiRoutes.campaigns.task(companyId, campaignId, taskId));
  },
  async detachTask(companyId: string, campaignId: string, taskId: string): Promise<void> {
    if (env.demoMode) return demoDelay(undefined);
    await http.delete(apiRoutes.campaigns.task(companyId, campaignId, taskId));
  },
};