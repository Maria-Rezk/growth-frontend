import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import { buildMetrics, demoDelay, demoReports, makeId } from '@/services/demoStore';
import type { Report, ReportOverview } from '@/types/domain';

export const reportsService = {
  async overview(companyId: string, params?: { month?: number; year?: number }): Promise<ReportOverview> {
    if (env.demoMode) {
      const { buildOverview } = await import('@/services/demoStore');
      return demoDelay(buildOverview());
    }
    const response = await http.get(apiRoutes.reports.overview(companyId), { params });
    return unwrap<ReportOverview>(response.data);
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
};