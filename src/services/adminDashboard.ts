import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http } from '@/lib/http';
import { withFilters } from '@/utils/dashboardFilters';
import type {
  ActivityItem,
  AdminOverview,
  ApiErrorShape,
  ApprovalsSummary,
  AttentionItem,
  AutomationsSummary,
  CampaignsSummary,
  ClientHealthRow,
  ContentPipeline,
  ContentPlansGrid,
  DashboardFilters,
  LeadsSummary,
  OverdueLeadRow,
  PageEnvelope,
  SystemHealth,
  TaskHealth,
  TeamWorkloadRow,
} from '@/types/domain';

/**
 * Unwraps at most one `{ data: … }` envelope.
 *
 * Deliberately not the shared `unwrap()` from lib/http: that helper treats an
 * `items` key as the payload and would hand back the bare array for every
 * paginated admin endpoint, throwing away the `pagination` block the page
 * controls read. Admin responses are already documented shapes — one optional
 * wrapper is all that needs peeling.
 */
function readData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const inner = (payload as { data?: unknown }).data;
    if (inner && typeof inner === 'object') return inner as T;
  }
  return payload as T;
}

/**
 * GET a SPEC endpoint — one the contract defines but the backend has not
 * shipped yet.
 *
 * A 404 *from the API* resolves to `null` instead of rejecting, so a widget
 * can render "Not available yet" rather than an error. That single decision is
 * what lets the whole dashboard ship before the backend lands. Every other
 * status still rejects normally: a 403 must reach the interceptor (it re-reads
 * the role), and a 500 is a real failure the user should see.
 *
 * `isApiResponse` is the important half of that condition. An offline ngrok
 * tunnel — or any proxy in front of the API — answers 404 with an HTML page
 * for *every* path, including endpoints that exist. Without the check, an
 * unreachable backend renders as twelve calm "Not available yet" cards and
 * hides the actual problem.
 */
async function specGet<T>(path: string, filters: DashboardFilters = {}): Promise<T | null> {
  // Demo mode has no admin fixtures. Reporting "not shipped" is truthful —
  // inventing agency-wide numbers would make a demo look like live data.
  if (env.demoMode) return null;

  try {
    const response = await http.get(withFilters(path, filters));
    return readData<T>(response.data);
  } catch (error) {
    const apiError = error as ApiErrorShape | undefined;
    if (apiError?.statusCode === 404 && apiError.isApiResponse) return null;
    throw error;
  }
}

/**
 * Guarantees the pagination envelope, whatever arrives.
 *
 * The backend task list and the frontend integration guide do not describe
 * these payloads identically — several backend examples omit fields the guide
 * documents. A widget that maps over `items` or reads `pagination.totalPages`
 * crashes on a leaner-than-agreed response, taking the card down instead of
 * degrading. Normalising here keeps that defence in one place rather than
 * scattering optional chaining through every table.
 */
function toPage<T>(raw: PageEnvelope<T> | null): PageEnvelope<T> | null {
  if (raw === null) return null;
  const items = Array.isArray(raw.items) ? raw.items : [];
  return {
    items,
    pagination: raw.pagination ?? { page: 1, limit: items.length || 20, total: items.length, totalPages: 1 },
  };
}

const routes = apiRoutes.admin.dashboard;

export const adminDashboardService = {
  overview: (filters: DashboardFilters) => specGet<AdminOverview>(routes.overview, filters),
  attention: async (filters: DashboardFilters) =>
    toPage(await specGet<PageEnvelope<AttentionItem>>(routes.attention, filters)),
  content: (filters: DashboardFilters) => specGet<ContentPipeline>(routes.content, filters),
  approvals: (filters: DashboardFilters) => specGet<ApprovalsSummary>(routes.approvals, filters),
  tasks: (filters: DashboardFilters) => specGet<TaskHealth>(routes.tasks, filters),
  teamWorkload: async (filters: DashboardFilters) =>
    toPage(await specGet<PageEnvelope<TeamWorkloadRow>>(routes.teamWorkload, filters)),
  leads: (filters: DashboardFilters) => specGet<LeadsSummary>(routes.leads, filters),
  overdueLeads: async (filters: DashboardFilters) =>
    toPage(await specGet<PageEnvelope<OverdueLeadRow>>(routes.overdueLeads, filters)),
  campaigns: (filters: DashboardFilters) => specGet<CampaignsSummary>(routes.campaigns, filters),
  contentPlans: (filters: DashboardFilters) => specGet<ContentPlansGrid>(routes.contentPlans, filters),
  clients: async (filters: DashboardFilters) =>
    toPage(await specGet<PageEnvelope<ClientHealthRow>>(routes.clients, filters)),
  automations: (filters: DashboardFilters) => specGet<AutomationsSummary>(routes.automations, filters),
  activity: async (filters: DashboardFilters) =>
    toPage(await specGet<PageEnvelope<ActivityItem>>(routes.activity, filters)),
  /** Super Admin only — an AGENCY_ADMIN gets 403, so never fetch it for them. */
  systemHealth: () => specGet<SystemHealth>(apiRoutes.admin.system.health),
};
