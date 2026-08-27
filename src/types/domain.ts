export type UUID = string;
export type ISODate = string;

export interface ApiErrorShape {
  message: string;
  statusCode?: number;
  fieldErrors?: Record<string, string>;
  /**
   * True when the response body was JSON — i.e. the answer came from the API
   * itself rather than from something sitting in front of it (an offline
   * tunnel, a reverse proxy, a CDN error page), which serve HTML.
   *
   * This matters for one specific decision: the admin dashboard reads a 404 as
   * "this endpoint is not built yet". An offline ngrok tunnel answers 404 with
   * an HTML page for *every* path, including endpoints that exist — so without
   * this flag a dead tunnel renders the whole dashboard as "Not available yet"
   * and hides the fact that the backend is simply unreachable.
   */
  isApiResponse?: boolean;
}

export const PlatformRole = {
  USER: 'USER',
  AGENCY_ADMIN: 'AGENCY_ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;
export type PlatformRole = (typeof PlatformRole)[keyof typeof PlatformRole];

/**
 * The two roles that reach the admin area. Both `AGENCY_ADMIN` and
 * `SUPER_ADMIN` see the whole agency — an admin is NOT narrowed to the clients
 * they are a member of.
 *
 * These two helpers are the only place a platform role string is compared.
 * Scattering `role === 'SUPER_ADMIN'` through components is how a capability
 * ends up half-gated when the matrix changes.
 */
export function isPlatformAdmin(role?: PlatformRole): boolean {
  return role === PlatformRole.AGENCY_ADMIN || role === PlatformRole.SUPER_ADMIN;
}

/**
 * Capabilities reserved to Super Admin: assigning platform roles, deleting a
 * client from the database, and the system health strip.
 *
 * Hiding a control is cosmetic — the API enforces the rule and answers 403.
 * Never treat a hidden button as security.
 */
export function isSuperAdmin(role?: PlatformRole): boolean {
  return role === PlatformRole.SUPER_ADMIN;
}

export interface User {
  id: UUID;
  email: string;
  fullName?: string;
  platformRole?: PlatformRole;
  status?: string;
  createdAt?: ISODate;
  updatedAt?: ISODate;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export const CompanyMembershipRole = {
  ACCOUNT_MANAGER: 'ACCOUNT_MANAGER',
  COPYWRITER: 'COPYWRITER',
  DESIGNER: 'DESIGNER',
  SOCIAL_MEDIA_MANAGER: 'SOCIAL_MEDIA_MANAGER',
  CLIENT_OWNER: 'CLIENT_OWNER',
  CLIENT_REVIEWER: 'CLIENT_REVIEWER',
  SALES_AGENT: 'SALES_AGENT',
} as const;
export type CompanyMembershipRole =
  (typeof CompanyMembershipRole)[keyof typeof CompanyMembershipRole];

export type MembershipStatus = 'ACTIVE' | 'SUSPENDED';

export type CompanyStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export interface Company {
  id: UUID;
  name: string;
  industry?: string | null;
  website?: string | null;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  status?: CompanyStatus;
  createdById?: UUID;
  createdAt?: ISODate;
  updatedAt?: ISODate;
}

export interface Membership {
  id: UUID;
  companyId: UUID;
  userId: UUID;
  role: CompanyMembershipRole;
  status: MembershipStatus;
  invitedById?: UUID;
  createdAt?: ISODate;
  updatedAt?: ISODate;
  user?: User;
  company?: Company;
}

export interface BrandColor {
  name: string;
  hex: string;
}

export interface BrandService {
  name: string;
  description?: string;
  priceRange?: string;
}

export interface BrandOffer {
  title: string;
  description?: string;
  validUntil?: string;
}

/*
  This previously described a completely different resource: flat strings for
  `services`, `brandColors`, `serviceAreas` and fields (`companyName`,
  `businessType`, `currentOffers`) the API does not have. Only `targetAudience`
  and `toneOfVoice` overlapped with reality.

  That mismatch is why BrandProfilePage carried three `as any` casts — the type
  was fiction, so the only way to compile was to opt out of it. Corrected to
  the shape the page actually sends and receives.
*/
export interface BrandProfile {
  id?: UUID;
  companyId?: UUID;
  brandName: string;
  industry: string;
  description: string;
  targetAudience: string;
  toneOfVoice: string;
  brandNotes?: string;
  // String arrays on the wire; the form edits them as comma-separated text.
  languages?: string[];
  serviceAreas?: string[];
  ctaPreferences?: string[];
  forbiddenWords?: string[];
  colors?: BrandColor[];
  services?: BrandService[];
  offers?: BrandOffer[];
  createdAt?: ISODate;
  updatedAt?: ISODate;
}

/** What the client may send. Server-owned fields are not writable. */
export type BrandProfileInput = Omit<BrandProfile, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>;

export const PostStatus = {
  DRAFT: 'DRAFT',
  IN_INTERNAL_REVIEW: 'IN_INTERNAL_REVIEW',
  READY_FOR_CLIENT: 'READY_FOR_CLIENT',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  APPROVED: 'APPROVED',
  SCHEDULED: 'SCHEDULED',
  PUBLISHED: 'PUBLISHED',
  CANCELED: 'CANCELED',
} as const;
export type PostStatus = (typeof PostStatus)[keyof typeof PostStatus];

export interface ContentPlan {
  id: UUID;
  companyId: UUID;
  title: string;
  month?: number;
  year?: number;
  createdAt?: ISODate;
  goal?: string;
  status?: string;
}

export interface ContentPost {
  id: UUID;
  companyId: UUID;
  contentPlanId?: UUID;
  title: string;
  caption?: string;
  visualBrief?: string;
  platform?: string;
  contentType?: string;
  status: PostStatus;
  scheduledAt?: ISODate;
  publishedUrl?: string;
  createdAt?: ISODate;
  updatedAt?: ISODate;
}

export interface PostComment {
  id: UUID;
  postId: UUID;
  body: string;
  authorId?: UUID;
  author?: User;
  isInternal?: boolean;
  createdAt?: ISODate;
}

export interface PostApprovalLog {
  id: UUID;
  postId: UUID;
  action: string;
  actorId?: UUID;
  actor?: User;
  note?: string;
  fromStatus?: string;
  toStatus?: string;
  createdAt?: ISODate;
}

export interface StoredFile {
  id: UUID;
  companyId: UUID;
  originalName?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  url?: string;
  createdAt?: ISODate;
}

export interface PostAsset {
  id: UUID;
  postId: UUID;
  fileId: UUID;
  file?: StoredFile;
  createdAt?: ISODate;
}
export const LeadSource = {
  INSTAGRAM: 'INSTAGRAM',
  FACEBOOK: 'FACEBOOK',
  TIKTOK: 'TIKTOK',
  WHATSAPP: 'WHATSAPP',
  WEBSITE: 'WEBSITE',
  REFERRAL: 'REFERRAL',
  OTHER: 'OTHER',
} as const;
export type LeadSource = (typeof LeadSource)[keyof typeof LeadSource];

export const LeadStatus = {
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  INTERESTED: 'INTERESTED',
  WAITING_DECISION: 'WAITING_DECISION',
  WON: 'WON',
  LOST: 'LOST',
  FOLLOW_UP_LATER: 'FOLLOW_UP_LATER',
} as const;
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

export interface Lead {
  id: UUID;
  companyId: UUID;
  name: string;
  email?: string;
  phone?: string;
  source?: string;
  interestedService?: string;
  notes?: string;
  nextFollowUpAt?: ISODate;
  status: LeadStatus;
  assignedToId?: UUID;
  assignedTo?: User;
  createdAt?: ISODate;
  updatedAt?: ISODate;
}

export interface LeadNote {
  id: UUID;
  leadId: UUID;
  body: string;
  authorId?: UUID;
  author?: User;
  createdAt?: ISODate;
}

export interface LeadStatusHistory {
  id: UUID;
  leadId: UUID;
  fromStatus?: LeadStatus;
  toStatus: LeadStatus;
  changedById?: UUID;
  changedBy?: User;
  note?: string;
  createdAt?: ISODate;
}

export const TaskStatus = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  IN_REVIEW: 'IN_REVIEW',
  BLOCKED: 'BLOCKED',
  DONE: 'DONE',
  CANCELED: 'CANCELED',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TaskPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;
export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];

export const TaskType = {
  COPYWRITING: 'COPYWRITING',
  DESIGN: 'DESIGN',
  CLIENT_REVIEW: 'CLIENT_REVIEW',
  FOLLOW_UP: 'FOLLOW_UP',
  PUBLISHING: 'PUBLISHING',
  REPORTING: 'REPORTING',
  GENERAL: 'GENERAL',
} as const;
export type TaskType = (typeof TaskType)[keyof typeof TaskType];

export interface Task {
  id: UUID;
  companyId: UUID;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  type: TaskType;
  assignedToId?: UUID;
  assignedTo?: User;
  relatedEntityType?: string;
  relatedEntityId?: UUID;
  dueDate?: ISODate;
  createdAt?: ISODate;
  updatedAt?: ISODate;
}

export interface TaskComment {
  id: UUID;
  taskId: UUID;
  body: string;
  authorId?: UUID;
  author?: User;
  createdAt?: ISODate;
}

export interface TaskActivityLog {
  id: UUID;
  taskId: UUID;
  action: string;
  metadata?: Record<string, unknown>;
  createdAt?: ISODate;
}

export interface TaskAttachment {
  id: UUID;
  taskId: UUID;
  fileId: UUID;
  file?: StoredFile;
  createdAt?: ISODate;
}
export interface ReportMetrics {
  posts: {
    total: number;
    approved: number;
    published: number;
    readyForClient: number;
    changesRequested: number;
    byStatus: Record<string, number>;
    byPlatform: Record<string, number>;
    byContentType: Record<string, number>;
  };
  leads: {
    total: number;
    won: number;
    lost: number;
    activePipeline: number;
    conversionRate: number;
    byStatus: Record<string, number>;
    bySource: Record<string, number>;
  };
}
export interface ReportOverview {
  postsTotal?: number;
  postsByStatus?: Record<string, number>;
  postsByPlatform?: Record<string, number>;
  postsByContentType?: Record<string, number>;
  leadsTotal?: number;
  leadsByStatus?: Record<string, number>;
  leadsBySource?: Record<string, number>;
  conversionRate?: number;
  recommendations?: string[];
}

export type ReportStatus = 'GENERATED' | 'DRAFT';

export interface Report {
  id: UUID;
  companyId: UUID;
  month: number;
  year: number;
  title?: string;
  summary?: string;
  metrics?: ReportMetrics;
  recommendations?: string[];
  notes?: string;
  status?: ReportStatus;
  createdById?: UUID;
  createdAt?: ISODate;
  updatedAt?: ISODate;
}
export const CampaignObjective = {
  AWARENESS: 'AWARENESS',
  ENGAGEMENT: 'ENGAGEMENT',
  LEADS: 'LEADS',
  SALES: 'SALES',
  RETENTION: 'RETENTION',
  LAUNCH: 'LAUNCH',
} as const;
export type CampaignObjective = (typeof CampaignObjective)[keyof typeof CampaignObjective];

// DRAFT and ACTIVE are confirmed from the live API. The rest are assumed
// defaults — adjust if the backend rejects one on status update.
export const CampaignStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELED: 'CANCELED',
} as const;
export type CampaignStatus = (typeof CampaignStatus)[keyof typeof CampaignStatus];

export interface Campaign {
  id: UUID;
  companyId: UUID;
  name: string;
  objective: CampaignObjective;
  status: CampaignStatus;
  description?: string;
  startDate?: ISODate;
  endDate?: ISODate;
  // The API returns budget as a string (e.g. "750.00") even though create
  // sends a number. Keep it string here and parse for display when needed.
  budget?: string;
  currency?: string;
  targetAudience?: string;
  notes?: string;
  createdById?: UUID;
  updatedById?: UUID;
  createdAt?: ISODate;
  updatedAt?: ISODate;
}

export interface CampaignMetrics {
  posts: {
    total: number;
    byStatus: Record<string, number>;
  };
  leads: {
    total: number;
    byStatus: Record<string, number>;
    won: number;
    conversionRate: number;
  };
  tasks: {
    total: number;
    byStatus: Record<string, number>;
  };
}

// GET /campaigns/:campaignId/overview returns { campaign, metrics }.
export interface CampaignOverview {
  campaign: Campaign;
  metrics: CampaignMetrics;
}

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'CANCELED';

/**
 * Roles that `POST /companies/:companyId/invitations` accepts.
 *
 * Deliberately narrower than `CompanyMembershipRole`. The invite endpoint
 * validates against its own list and 400s on anything else — the API
 * collection pins this with a "Validation Test - Invalid Role" request.
 * Widening this array without widening the backend DTO first will produce
 * options the user can select but the server will refuse.
 *
 * Note this is *not* the same set as the member role-change endpoint
 * (`PATCH /companies/:companyId/members/:membershipId`), which can move an
 * existing member to any role.
 */
export const INVITABLE_ROLES = [
  CompanyMembershipRole.CLIENT_REVIEWER,
  CompanyMembershipRole.SALES_AGENT,
] as const;

export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export interface Invitation {
  id: UUID;
  companyId: UUID;
  email: string;
  fullName?: string;
  role: CompanyMembershipRole;
  status: InvitationStatus;
  invitedById?: UUID;
  acceptedById?: UUID | null;
  acceptedAt?: ISODate | null;
  // The live API does NOT return the raw token on the invitation object.
  // It is returned once on the create response as `invitationToken`
  // (see InvitationCreateResult). Kept optional for demo data only.
  token?: string;
  expiresAt?: ISODate;
  createdAt?: ISODate;
  updatedAt?: ISODate;
}

export interface InvitationCreateResult {
  invitation: Invitation;
  invitationToken: string;
  acceptPath: string;
}
export interface AcceptInvitationResult {
  user: User;
  membership: Membership;
}
export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_STATUS_CHANGED'
  | 'TASK_COMMENTED'
  | 'POST_SUBMITTED_TO_CLIENT'
  | 'POST_CHANGES_REQUESTED'
  | 'POST_APPROVED'
  | 'POST_PUBLISHED'
  | 'POST_COMMENTED'
  | 'POST_REJECTED'
  | 'LEAD_ASSIGNED'
  | 'LEAD_STATUS_CHANGED'
  | 'INVITATION_CREATED'
  | 'INVITATION_ACCEPTED'
  | 'REPORT_CREATED';

export interface AppNotification {
  id: UUID;
  type: NotificationType;
  title?: string;
  message?: string;
  readAt?: ISODate | null;
  relatedEntityType?: string;
  relatedEntityId?: UUID;
  createdAt?: ISODate;
}

export interface ListParams {
  status?: string;
  priority?: string;
  type?: string;
  source?: string;
  assignedToId?: string;
  search?: string;
}
// ===========================================================================
// APPEND TO: src/types/domain.ts
// Responsibilities (RACI matrix) — mirrors the backend contract exactly.
// ===========================================================================

export type ResponsibilityType =
  | 'TO_MANAGE'
  | 'TO_SUPPORT'
  | 'TO_FOLLOW_UP'
  | 'TO_BE_HELD_RESPONSIBLE'
  | 'TO_APPROVE'
  | 'TO_WORK_ON'
  | 'TO_CONSULT'
  | 'TO_COORDINATE'
  | 'TO_BE_INFORMED'
  | 'TO_SUPERVISE'
  | 'OTHER';

export const RESPONSIBILITY_TYPE_LABELS: Record<ResponsibilityType, string> = {
  TO_MANAGE: 'To Manage',
  TO_SUPPORT: 'To Support',
  TO_FOLLOW_UP: 'To Follow-Up',
  TO_BE_HELD_RESPONSIBLE: 'To Be Held Responsible',
  TO_APPROVE: 'To Approve',
  TO_WORK_ON: 'To Work On',
  TO_CONSULT: 'To Consult',
  TO_COORDINATE: 'To Coordinate',
  TO_BE_INFORMED: 'To Be Informed',
  TO_SUPERVISE: 'To Supervise',
  OTHER: 'Other',
};

export interface ResponsibilityArea {
  id: UUID;
  companyId: UUID;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdById: UUID | null;
  updatedById: UUID | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface ResponsibilityAreaPayload {
  name: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface AssignmentMemberUser {
  id: UUID;
  email: string;
  fullName: string;
  platformRole: PlatformRole;
  status: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface ResponsibilityAssignment {
  id: UUID;
  companyId: UUID;
  areaId: UUID;
  memberUserId: UUID;
  type: ResponsibilityType;
  customLabel: string | null; // set only when type === 'OTHER'
  note: string | null;
  assignedById: UUID | null;
  updatedById: UUID | null;
  createdAt: ISODate;
  updatedAt: ISODate;
  area: ResponsibilityArea;
  memberUser: AssignmentMemberUser;
}

export interface AssignResponsibilityPayload {
  areaId: UUID;
  memberUserId: UUID;
  type: ResponsibilityType;
  customLabel?: string; // required when type === 'OTHER' (2–120)
  note?: string; // ≤1000
}

export interface UpdateResponsibilityPayload {
  type?: ResponsibilityType;
  customLabel?: string;
  note?: string;
}

export interface BulkAssignResult {
  created: number;
  updated: number;
  total: number;
}

export interface ResponsibilityMatrixCell {
  assignmentId: UUID;
  areaId: UUID;
  memberUserId: UUID;
  type: ResponsibilityType;
  customLabel: string | null;
  note: string | null;
}

export interface ResponsibilityMatrix {
  areas: Array<{ id: UUID; name: string; sortOrder: number }>;
  members: Array<{
    userId: UUID;
    fullName: string;
    email: string;
    role: string | null; // CompanyMembershipRole — clients are excluded server-side
  }>;
  cells: ResponsibilityMatrixCell[];
}

// NOTE: if `Paginated<T>` does not exist yet in domain.ts, add it once (it is
// also the shape leads.listPaged uses):
export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// ===========================================================================
// Platform employee administration (POST/GET/PATCH /users, /companies/:id/members)
// ===========================================================================

export interface EmployeeClientMembership {
  membershipId: UUID;
  companyId: UUID;
  companyName: string;
  role: CompanyMembershipRole;
}

export interface Employee extends User {
  clients: EmployeeClientMembership[];
}

export interface CreateEmployeePayload {
  fullName: string;
  email: string;
  password: string;
  platformRole?: PlatformRole;
}

/**
 * Body for `PATCH /users/:userId`.
 *
 * `platformRole` is deliberately absent. It moved to its own Super-Admin-only
 * route (`PATCH /users/:userId/platform-role`), and because the API validates
 * with `forbidNonWhitelisted`, sending it here is a 400 — not a silently
 * ignored field. Role changes go through `usersService.updatePlatformRole`.
 */
export interface UpdateEmployeePayload {
  fullName?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  password?: string;
}
// ===========================================================================
// Admin & Super Admin operations dashboard
// Companion to "Frontend Integration Guide — Admin & Super Admin Dashboard"
// (25 August 2026, revision 2 of the backend task list).
//
// Endpoints marked SPEC in that guide are not built yet and answer 404. The
// service layer turns that 404 into `null` rather than an error — see
// `services/adminDashboard.ts` — so a widget can render "Not available yet"
// instead of a failure. Every type below is therefore reached as `T | null`.
// ===========================================================================

export type Severity = 'INFO' | 'WARNING' | 'CRITICAL';
export type SlaState = 'NORMAL' | 'WARNING' | 'CRITICAL';

/** Shared query parameters accepted by every `/admin/dashboard/*` endpoint. */
export interface DashboardFilters {
  from?: string;
  to?: string;
  clientId?: UUID;
  employeeId?: UUID;
  status?: string;
  priority?: string;
  page?: number;
  limit?: number;
  /** `/dashboard/content-plans` only. */
  month?: number;
  /** `/dashboard/content-plans` only. */
  year?: number;
  /** `/dashboard/activity` only. */
  userId?: UUID;
  /** `/dashboard/activity` only. */
  entityType?: string;
}

/**
 * Pagination envelope returned by every admin list endpoint.
 *
 * Deliberately *not* `Paginated<T>` above: that one is the client-workspace
 * shape (`{ total, limit, offset }`). Same idea, different keys — reusing one
 * for the other silently reads `undefined` for every page control.
 */
export interface PageEnvelope<T> {
  items: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/** `{ id, name }` — the shape the dashboard uses for every entity reference. */
export interface Ref {
  id: UUID;
  name: string;
}

export interface AdminOverview {
  activeClients: number;
  activeEmployees: number;
  dueToday: number;
  overdue: number;
  blockedTasks: number;
  waitingClientApproval: number;
  leadFollowUpsToday: number;
  overdueLeadFollowUps: number;
  publishedToday: number;
}

/**
 * `type` is an OPEN set — the backend adds new ones as it grows. Never
 * `switch` on it without a default; see `attentionMeta.tsx`, which falls back
 * to a generic row rather than dropping an item it does not recognise.
 */
export interface AttentionItem {
  type: string;
  severity: Severity;
  client: Ref;
  entityId: UUID;
  title: string;
  owner: Ref | null;
  dueAt: ISODate | null;
  waitingSince: ISODate | null;
  ageMinutes: number;
}

export interface ContentPipeline {
  byStatus: Record<string, number>;
  publishedToday: number;
  scheduledToday: number;
  awaitingClientAction: number;
  changesRequested: number;
  /** SCHEDULED with `scheduledAt <= now` — needs a human to press publish. */
  publishingDue: number;
  averageApprovalWaitHours: number;
}

export interface ApprovalsClientRow {
  clientId: UUID;
  clientName: string;
  waiting: number;
  oldestWaitingHours: number;
  changesRequested: number;
  slaState: SlaState;
}

export interface ApprovalsSummary {
  waiting: number;
  overThreshold: number;
  averageWaitHours: number;
  approvedToday: number;
  rejectedToday: number;
  oldestWaiting: {
    postId: UUID;
    title: string;
    clientId: UUID;
    clientName: string;
    waitingHours: number;
    slaState: SlaState;
  } | null;
  clients: ApprovalsClientRow[];
}

export interface TaskHealth {
  openTotal: number;
  byStatus: Record<string, number>;
  dueToday: number;
  overdue: number;
  urgent: number;
  highPriority: number;
  unassigned: number;
  completedToday: number;
}

export interface TeamWorkloadRow {
  employeeId: UUID;
  name: string;
  clients: number;
  openTasks: number;
  dueToday: number;
  overdue: number;
  blocked: number;
  inReview: number;
  urgent: number;
}

export interface LeadsSummary {
  byStatus: Record<string, number>;
  newToday: number;
  followUpsToday: number;
  overdueFollowUps: number;
  wonThisMonth: number;
  lostThisMonth: number;
  /** A ratio (0.21), not a percentage. Format it; never recompute it. */
  conversionRate: number;
}

export interface OverdueLeadRow {
  leadId: UUID;
  leadName: string;
  client: Ref;
  assignedTo: Ref | null;
  status: LeadStatus;
  followUpDate: ISODate;
  overdueHours: number;
  overdueDays: number;
}

export interface ActiveCampaignRow {
  campaignId: UUID;
  name: string;
  client: Ref;
  objective: string;
  startDate: ISODate;
  endDate: ISODate;
  tasks: { total: number; completed: number };
  posts: { total: number; published: number };
  leads: { total: number; won: number };
}

export interface CampaignsSummary {
  counts: {
    active: number;
    draft: number;
    paused: number;
    completed: number;
    endingSoon: number;
    withOverdueTasks: number;
  };
  active: ActiveCampaignRow[];
}

/**
 * `MISSING` is derived server-side, not a stored status: an active client with
 * no plan for the selected month. It is the cell worth chasing, so the UI
 * treats it as a first-class status rather than an absence.
 */
export interface ContentPlanClientRow {
  clientId: UUID;
  clientName: string;
  planId: UUID | null;
  status: string;
  accountManager: Ref | null;
}

export interface ContentPlansGrid {
  month: number;
  year: number;
  byStatus: Record<string, number>;
  clients: ContentPlanClientRow[];
}

export interface ClientHealthRow {
  clientId: UUID;
  clientName: string;
  status: CompanyStatus;
  tasks: { open: number; overdue: number; blocked: number };
  content: { waitingApproval: number; changesRequested: number; scheduled: number; published: number };
  leads: { open: number; overdueFollowUps: number };
  campaigns: { active: number };
  contentPlan: { month: number; year: number; status: string };
  /**
   * Raw signals for a health score that does not exist yet. Render them; do
   * not invent a score or a colour rule from them — the Product Owner owns
   * that and it will arrive as a server value.
   */
  healthInputs: Record<string, number | string>;
}

export interface AutomationFailure {
  runId: UUID;
  ruleId: UUID;
  ruleName: string;
  client: Ref;
  trigger: string;
  action: string;
  failedAt: ISODate;
  error: string;
}

export interface AutomationsSummary {
  runsToday: number;
  successfulRuns: number;
  failedRuns: number;
  activeRules: number;
  inactiveRules: number;
  lastFailedRuns: AutomationFailure[];
}

export interface ActivityItem {
  id: UUID;
  action: string;
  actor: Ref | null;
  /**
   * A snapshot, not a live reference — a deleted client still shows its name
   * here. Render the name, never a link into a workspace that may be gone.
   */
  client: Ref | null;
  entityType: string;
  entityId: UUID;
  metadata?: Record<string, unknown>;
  createdAt: ISODate;
}

/**
 * Open set of service names to open set of states. `UP` is not the only good
 * value — `NOT_IN_USE` and `MOCK` are expected today, so anything other than
 * `UP` must not be rendered as a failure.
 */
export type SystemHealth = Record<string, string>;

export interface DeleteClientResult {
  deleted: boolean;
  clientId: UUID;
  clientName: string;
  removed: {
    tasks: number;
    posts: number;
    leads: number;
    campaigns: number;
    memberships: number;
    files: number;
  };
}
