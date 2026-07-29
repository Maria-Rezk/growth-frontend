import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import { demoBrandProfile, demoDelay } from '@/services/demoStore';
import type { BrandProfile, BrandProfileInput } from '@/types/domain';

export const brandProfilesService = {
  async get(companyId: string): Promise<BrandProfile | null> {
    if (env.demoMode) return demoDelay(demoBrandProfile.companyId === companyId ? demoBrandProfile : null);
    try {
      const response = await http.get(apiRoutes.brandProfile(companyId));
      return unwrap<BrandProfile | null>(response.data);
    } catch (error) {
      // No profile yet is a normal state, not an error to surface.
      if ((error as { statusCode?: number })?.statusCode === 404) return null;
      throw error;
    }
  },

  async create(companyId: string, payload: BrandProfileInput): Promise<BrandProfile> {
    if (env.demoMode) return brandProfilesService.upsert(companyId, payload);
    const response = await http.post(apiRoutes.brandProfile(companyId), payload);
    return unwrap<BrandProfile>(response.data);
  },

  async update(companyId: string, payload: Partial<BrandProfileInput>): Promise<BrandProfile> {
    if (env.demoMode) return brandProfilesService.upsert(companyId, payload as BrandProfileInput);
    const response = await http.patch(apiRoutes.brandProfile(companyId), payload);
    return unwrap<BrandProfile>(response.data);
  },

  /** Chooses POST (first time) or PATCH (already exists) based on `exists`. */
  async upsert(companyId: string, payload: BrandProfileInput, exists = false): Promise<BrandProfile> {
    if (env.demoMode) {
      Object.assign(demoBrandProfile, { ...payload, id: demoBrandProfile.id, companyId, updatedAt: new Date().toISOString() });
      return demoDelay(demoBrandProfile);
    }
    return exists
      ? brandProfilesService.update(companyId, payload)
      : brandProfilesService.create(companyId, payload);
  },
};
