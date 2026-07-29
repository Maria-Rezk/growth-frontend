export type UUID = string;
export type ISODate = string;

export interface ApiErrorShape {
  message: string;
  statusCode?: number;
  fieldErrors?: Record<string, string>;
}

export interface User {
  id: UUID;
  email: string;
  fullName?: string;
  platformRole?: 'USER' | 'AGENCY_ADMIN';
  status?: string;
  createdAt?: ISODate;
  updatedAt?: ISODate;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest extends LoginRequest {
  fullName: string;
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

export interface Company {
  id: UUID;
  name: string;
  createdAt?: ISODate;
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

export interface BrandProfile {
  id?: UUID;
  companyId?: UUID;
  companyName: string;
  businessType: string;
  services: string;
  targetAudience: string;
  toneOfVoice: string;
  brandColors: string;
  currentOffers?: string;
  serviceAreas?: string;
  createdAt?: ISODate;
  updatedAt?: ISODate;
}

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
  platformRole: 'USER' | 'AGENCY_ADMIN' | 'SUPER_ADMIN';
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