import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { appRoutes } from '@/config/appRoutes';
import { http, unwrap } from '@/lib/http';
import { buildMetrics, demoCompany, demoDelay, demoReportShares, demoReports, makeId } from '@/services/demoStore';
import type { PublicReport, Report, ReportOverview, ReportShareResult, ReportShareStatus } from '@/types/domain';

const SHARE_DAYS = 90;

/*
  The overview is read flat (`leadsTotal`, `leadsByStatus`…), but the lead
  outcome figures are documented under a nested `leads` object. Accept both
  so either spelling fills the same fields.
*/
type RawOverview = ReportOverview & {
  leads?: Partial<{
    total: number;
    byStatus: Record<string, number>;
    bySource: Record<string, number>;
    byLostReason: Record<string, number>;
    wonValue: number;
    conversionRate: number;
  }>;
};

function normalizeOverview(raw: RawOverview): ReportOverview {
  const { leads, ...flat } = raw ?? {};
  return {
    ...flat,
    leadsTotal: flat.leadsTotal ?? leads?.total,
    leadsByStatus: flat.leadsByStatus ?? leads?.byStatus,
    leadsBySource: flat.leadsBySource ?? leads?.bySource,
    leadsByLostReason: flat.leadsByLostReason ?? leads?.byLostReason,
    wonValue: flat.wonValue ?? leads?.wonValue,
    conversionRate: flat.conversionRate ?? leads?.conversionRate,
  };
}

function demoNotFound(): Error {
  return Object.assign(new Error('This report link is not valid.'), { statusCode: 404 });
}

export const reportsService = {
  async overview(companyId: string, params?: { month?: number; year?: number }): Promise<ReportOverview> {
    if (env.demoMode) {
      const { buildOverview } = await import('@/services/demoStore');
      return demoDelay(buildOverview());
    }
    const response = await http.get(apiRoutes.reports.overview(companyId), { params });
    return normalizeOverview(unwrap<RawOverview>(response.data));
  },
  async generateMonthly(
    companyId: string,
    payload: { month: number; year: number; notes?: string },
  ): Promise<Report> {
    if (env.demoMode) {
      const report: Report = {
        id: makeId('report'),
        companyId,
        month: payload.month,
        year: payload.year,
        title: `Monthly Report - ${payload.month}/${payload.year}`,
        status: 'GENERATED',
        metrics: buildMetrics(),
        notes: payload.notes,
        createdAt: new Date().toISOString(),
      };
      demoReports.unshift(report);
      return demoDelay(report);
    }
    const response = await http.post(apiRoutes.reports.monthly(companyId), payload);
    return unwrap<Report>(response.data);
  },
  async list(companyId: string): Promise<Report[]> {
    if (env.demoMode) return demoDelay(demoReports.filter((report) => report.companyId === companyId));
    const response = await http.get(apiRoutes.reports.list(companyId));
    return unwrap<Report[]>(response.data);
  },
  async get(companyId: string, reportId: string): Promise<Report> {
    if (env.demoMode) {
      const report = demoReports.find((item) => item.companyId === companyId && item.id === reportId);
      if (!report) throw new Error('Report not found.');
      return demoDelay(report);
    }
    const response = await http.get(apiRoutes.reports.detail(companyId, reportId));
    return unwrap<Report>(response.data);
  },

  /**
   * Mints a public link. Only a hash is stored, so the URL comes back once —
   * a repeat call answers `{ url: null, created: false }`. `rotate` replaces
   * the existing link and revokes the old one.
   */
  async createShareLink(companyId: string, reportId: string, rotate = false): Promise<ReportShareResult> {
    if (env.demoMode) {
      const existing = demoReportShares.get(reportId);
      if (existing && !rotate) {
        return demoDelay({ url: null, created: false, expiresAt: existing.expiresAt, createdAt: existing.createdAt });
      }
      const now = new Date();
      const share = {
        token: makeId('share'),
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + SHARE_DAYS * 86_400_000).toISOString(),
        viewCount: 0,
        lastViewedAt: null,
      };
      demoReportShares.set(reportId, share);
      return demoDelay({
        url: `${window.location.origin}${appRoutes.publicReport(share.token)}`,
        created: true,
        expiresAt: share.expiresAt,
        createdAt: share.createdAt,
      });
    }
    const response = await http.post(apiRoutes.reports.share(companyId, reportId), {}, {
      params: rotate ? { rotate: true } : undefined,
    });
    return unwrap<ReportShareResult>(response.data);
  },

  async getShareLink(companyId: string, reportId: string): Promise<ReportShareStatus> {
    if (env.demoMode) {
      const share = demoReportShares.get(reportId);
      if (!share) return demoDelay({ active: false });
      return demoDelay({ active: true, expiresAt: share.expiresAt, createdAt: share.createdAt, lastViewedAt: share.lastViewedAt, viewCount: share.viewCount });
    }
    const response = await http.get(apiRoutes.reports.share(companyId, reportId));
    return unwrap<ReportShareStatus>(response.data);
  },

  /** 204; the link stops working immediately. */
  async revokeShareLink(companyId: string, reportId: string): Promise<void> {
    if (env.demoMode) {
      demoReportShares.delete(reportId);
      return demoDelay(undefined);
    }
    await http.delete(apiRoutes.reports.share(companyId, reportId));
  },

  /** No session. 404 for a wrong, revoked or expired token. */
  async getPublic(token: string): Promise<PublicReport> {
    if (env.demoMode) {
      const entry = [...demoReportShares.entries()].find(([, share]) => share.token === token);
      if (!entry || new Date(entry[1].expiresAt).getTime() < Date.now()) throw demoNotFound();
      const report = demoReports.find((item) => item.id === entry[0]);
      if (!report) throw demoNotFound();
      entry[1].viewCount += 1;
      entry[1].lastViewedAt = new Date().toISOString();
      const { notes: _notes, createdById: _createdById, ...publicFields } = report;
      return demoDelay({ ...publicFields, company: { name: demoCompany.name }, sharedUntil: entry[1].expiresAt });
    }
    const response = await http.get(apiRoutes.public.report(token));
    return unwrap<PublicReport>(response.data);
  },
};
