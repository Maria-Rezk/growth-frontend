import type {
  AppNotification,
  Attachment,
  BrandProfile,
  Company,
  ContentPlan,
  ContentPost,
  Employee,
  Invitation,
  Lead,
  LeadNote,
  LeadStatus,
  LeadStatusHistory,
  ListParams,
  Membership,
  NotificationPreferences,
  PostApprovalLog,
  PostComment,
  Report,
  ReportMetrics,
  ReportOverview,
  StoredFile,
  Task,
  TaskActivityLog,
  TaskComment,
  TaskStatus,
  User,
  Campaign,
  CampaignMetrics,
} from '@/types/domain';

/*
  Built so that a production build can drop all of it (F-06, step 0 of
  docs/demo-architecture-review.md). Every service imports this module, and
  Rollup keeps any top-level expression it cannot prove free of side effects:
  a call to a function it does not know, or a property read on another record
  (a getter could run). So the records refer to each other by name, never as
  `DEMO_COMPANY_ID` or `demoDesignerUser`, and the date helper is marked
  as having no side effects. The values are the same as before.
*/
const today = new Date();

/* @__NO_SIDE_EFFECTS__ */
function iso(offsetDays = 0): string {
  const date = new Date(today);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString();
}

const DEMO_USER_ID = 'demo-user';
const DEMO_COMPANY_ID = 'demo-company';
const DEMO_COMPANY_NAME = 'Solu1ions Demo Workspace';
const demoDesignerUser = { id: 'demo-designer', email: 'designer@solu1ions.com', fullName: 'Demo Designer' };
const demoClientUser = { id: 'demo-client', email: 'client@example.com', fullName: 'Client Reviewer' };
/** A second member of staff, so a step can have two people working side by side. */
const demoCopywriterUser = { id: 'demo-copywriter', email: 'copy@solu1ions.com', fullName: 'Demo Copywriter', status: 'ACTIVE' };

export const demoUser: User = {
  id: DEMO_USER_ID,
  email: 'demo@solu1ions.com',
  fullName: 'Demo User',
  platformRole: 'SUPER_ADMIN',
  status: 'ACTIVE',
  createdAt: iso(-30),
};

export const demoCompany: Company = {
  id: DEMO_COMPANY_ID,
  name: DEMO_COMPANY_NAME,
  createdAt: iso(-90),
};

export const demoMemberships: Membership[] = [
  {
    id: 'demo-membership-1',
    companyId: DEMO_COMPANY_ID,
    userId: DEMO_USER_ID,
    roles: ['ACCOUNT_MANAGER'],
    role: 'ACCOUNT_MANAGER',
    status: 'ACTIVE',
    user: demoUser,
    company: demoCompany,
  },
  {
    id: 'demo-membership-2',
    companyId: DEMO_COMPANY_ID,
    userId: 'demo-designer',
    roles: ['DESIGNER', 'COPYWRITER'],
    role: 'DESIGNER',
    status: 'ACTIVE',
    user: demoDesignerUser,
    company: demoCompany,
  },
  {
    id: 'demo-membership-4',
    companyId: DEMO_COMPANY_ID,
    userId: 'demo-copywriter',
    roles: ['COPYWRITER'],
    role: 'COPYWRITER',
    status: 'ACTIVE',
    user: demoCopywriterUser,
    company: demoCompany,
  },
  {
    id: 'demo-membership-3',
    companyId: DEMO_COMPANY_ID,
    userId: 'demo-client',
    roles: ['CLIENT_REVIEWER'],
    role: 'CLIENT_REVIEWER',
    status: 'ACTIVE',
    user: demoClientUser,
    company: demoCompany,
  },
];

export const demoBrandProfile: BrandProfile = {
  id: 'demo-brand-profile',
  companyId: DEMO_COMPANY_ID,
  brandName: 'Solu1ions Business Development',
  industry: 'Business development, marketing, IT and AI services',
  description: 'Practical growth systems for organisations that need structure, not slogans.',
  targetAudience: 'Startups, SMEs, NGOs and corporate clients that need practical growth systems.',
  toneOfVoice: 'Professional, modern, strategic, confident and practical.',
  brandNotes: 'Avoid guarantees about results. Never promise specific revenue figures.',
  languages: ['ar', 'en'],
  serviceAreas: ['Syria', 'MENA', 'Remote consulting'],
  ctaPreferences: ['Book a call', 'Request an audit'],
  forbiddenWords: ['cheap', 'guaranteed'],
  colors: [
    { name: 'Magenta', hex: '#c9144b' },
    { name: 'Navy', hex: '#2b344f' },
    { name: 'Concrete', hex: '#f2f2f2' },
  ],
  services: [
    { name: 'Social media management', description: 'Monthly content plans, approvals and publishing.', priceRange: '$$' },
    { name: 'CRM setup', description: 'Lead pipeline, roles and reporting.', priceRange: '$$$' },
  ],
  offers: [
    { title: 'Growth audit', description: 'One-off review of funnel and content.', validUntil: '' },
  ],
  createdAt: iso(-20),
  updatedAt: iso(-2),
};

export const demoContentPlans: ContentPlan[] = [
  { id: 'plan-1', companyId: DEMO_COMPANY_ID, title: 'June Growth Content Plan', month: 6, year: 2026, createdAt: iso(-7) },
];

export const demoPosts: ContentPost[] = [
  {
    id: 'post-1',
    companyId: DEMO_COMPANY_ID,
    contentPlanId: 'plan-1',
    title: 'Agency Growth OS launch teaser',
    caption: 'A single operating system for content, leads, approvals and execution. Built for agencies that want fewer scattered tools and better delivery control.',
    visualBrief: 'Dark blue dashboard mockup with magenta highlights, task cards and content calendar preview.',
    platform: 'LinkedIn',
    contentType: 'Carousel',
    status: 'READY_FOR_CLIENT',
    scheduledAt: iso(3),
    createdAt: iso(-6),
    updatedAt: iso(-1),
  },
  {
    id: 'post-2',
    companyId: DEMO_COMPANY_ID,
    contentPlanId: 'plan-1',
    title: 'Client approval workflow explainer',
    caption: 'No more lost approvals in WhatsApp threads. Review, comment, approve and publish from one place.',
    visualBrief: 'Workflow diagram from draft to client approval to published.',
    platform: 'Instagram',
    contentType: 'Reel',
    status: 'DRAFT',
    scheduledAt: iso(5),
    createdAt: iso(-4),
    updatedAt: iso(-3),
  },
  {
    id: 'post-3',
    companyId: DEMO_COMPANY_ID,
    contentPlanId: 'plan-1',
    title: 'Lead pipeline from social media',
    caption: 'Every inquiry deserves follow-up. Turn social media messages into tracked sales opportunities.',
    visualBrief: 'CRM pipeline cards with source, owner and next step.',
    platform: 'Facebook',
    contentType: 'Static Post',
    // Scheduled for yesterday and still not marked published — the case the
    // "Due to publish" strip exists for.
    status: 'SCHEDULED',
    scheduledAt: iso(-1),
    createdAt: iso(-8),
    updatedAt: iso(-2),
  },
];

export const demoPostComments: PostComment[] = [
  { id: 'post-comment-1', postId: 'post-1', body: 'Looks clear. Please make the CTA stronger.', authorId: 'demo-client', author: demoClientUser, createdAt: iso(-1) },
  { id: 'post-comment-2', postId: 'post-1', body: 'I will revise the last slide and send it back for approval.', authorId: 'demo-user', author: demoUser, createdAt: iso(0) },
];

export const demoPostLogs: PostApprovalLog[] = [
  { id: 'approval-log-1', postId: 'post-1', action: 'SUBMITTED_TO_CLIENT', actorId: 'demo-user', actor: demoUser, createdAt: iso(-2) },
  { id: 'approval-log-2', postId: 'post-1', action: 'CLIENT_COMMENTED', actorId: 'demo-client', actor: demoClientUser, note: 'CTA needs refinement.', createdAt: iso(-1) },
];

export const demoFiles: StoredFile[] = [
  { id: 'file-1', companyId: DEMO_COMPANY_ID, originalName: 'launch-carousel-v1.png', filename: 'launch-carousel-v1.png', mimeType: 'image/png', size: 248000, createdAt: iso(-1) },
  { id: 'file-2', companyId: DEMO_COMPANY_ID, originalName: 'approval-flow-wireframe.pdf', filename: 'approval-flow-wireframe.pdf', mimeType: 'application/pdf', size: 512000, createdAt: iso(-2) },
];

export const demoAttachments: Attachment[] = [
  {
    id: 'attachment-1', kind: 'FILE', entityType: 'POST', entityId: 'post-1', label: null, url: null, text: null,
    uploadedById: 'demo-designer', uploadedBy: { id: 'demo-designer', fullName: 'Demo Designer' }, createdAt: iso(-1),
    file: { id: 'file-1', originalName: 'launch-carousel-v1.png', mimeType: 'image/png', size: 248000 },
  },
  {
    id: 'attachment-2', kind: 'FILE', entityType: 'TASK', entityId: 'task-1', label: 'Wireframe', url: null, text: null,
    uploadedById: 'demo-user', uploadedBy: { id: 'demo-user', fullName: 'Demo User' }, createdAt: iso(-1),
    file: { id: 'file-2', originalName: 'approval-flow-wireframe.pdf', mimeType: 'application/pdf', size: 512000 },
  },
];

export const demoLeads: Lead[] = [
  { id: 'lead-1', companyId: DEMO_COMPANY_ID, name: 'Nour Clinic', email: 'hello@nourclinic.com', phone: '+963 999 111 222', source: 'INSTAGRAM', status: 'INTERESTED', nextFollowUpAt: iso(-1), assignedToId: 'demo-user', assignedTo: demoUser, createdAt: iso(-10), updatedAt: iso(-1) },
  { id: 'lead-2', companyId: DEMO_COMPANY_ID, name: 'Alpha Retail', email: 'contact@alpharetail.com', phone: '+963 999 333 444', source: 'WEBSITE', status: 'CONTACTED', nextFollowUpAt: iso(0), assignedToId: 'demo-user', assignedTo: demoUser, createdAt: iso(-5), updatedAt: iso(-2) },
  { id: 'lead-3', companyId: DEMO_COMPANY_ID, name: 'Daleel Chicago', source: 'REFERRAL', status: 'NEW', createdAt: iso(-1), updatedAt: iso(-1) },
];

export const demoLeadNotes: LeadNote[] = [
  { id: 'lead-note-1', leadId: 'lead-1', body: 'Interested in CRM plus social media reporting. Needs proposal by next week.', authorId: 'demo-user', author: demoUser, createdAt: iso(-1) },
];

export let demoLeadHistory: LeadStatusHistory[] = [
  { id: 'lead-history-1', leadId: 'lead-1', fromStatus: 'NEW', toStatus: 'CONTACTED', changedById: 'demo-user', changedBy: demoUser, createdAt: iso(-8) },
  { id: 'lead-history-2', leadId: 'lead-1', fromStatus: 'CONTACTED', toStatus: 'INTERESTED', changedById: 'demo-user', changedBy: demoUser, createdAt: iso(-3) },
];

/** The user object behind a demo membership, for `approver` / `assignedTo` relations. */
export function demoMemberUser(userId: string): User | null {
  return demoMemberships.find((membership) => membership.userId === userId)?.user ?? null;
}

export const demoTasks: Task[] = [
  { id: 'task-1', companyId: DEMO_COMPANY_ID, title: 'Revise launch carousel CTA', description: 'Update the final slide CTA and prepare the asset for client approval.', status: 'IN_REVIEW', priority: 'HIGH', taskTypes: ['DESIGN'], customTaskType: null, isDraft: false, startedAt: iso(-2), assignedToId: 'demo-designer', assignedTo: demoDesignerUser, assignees: [{ id: 'task-assignee-1', stepOrder: 1, status: 'IN_REVIEW', userId: 'demo-designer', role: 'DESIGNER', user: demoDesignerUser, approverId: DEMO_USER_ID, approver: demoUser, reachedAt: iso(-2), startedAt: iso(-2), submittedAt: iso(-1), reviewedAt: null, completedAt: null, reviewNote: null, assignedById: DEMO_USER_ID, createdAt: iso(-2) }, { id: 'task-assignee-2', stepOrder: 2, status: 'PENDING', userId: DEMO_USER_ID, role: 'ACCOUNT_MANAGER', user: demoUser, approverId: null, approver: null, reachedAt: null, startedAt: null, submittedAt: null, reviewedAt: null, completedAt: null, reviewNote: null, assignedById: DEMO_USER_ID, createdAt: iso(-2) }], approverId: DEMO_USER_ID, approver: demoUser, submittedForReviewAt: iso(-1), reviewedAt: null, reviewNote: null, relatedEntityType: 'POST', relatedEntityId: 'post-1', sequence: 1, dueDate: iso(1), createdAt: iso(-2), updatedAt: iso(-1) },
  { id: 'task-2', companyId: DEMO_COMPANY_ID, title: 'Follow up with Nour Clinic', description: 'Send proposal summary and confirm decision timeline.', status: 'IN_PROGRESS', priority: 'URGENT', taskTypes: ['OTHER'], customTaskType: 'Follow up', isDraft: false, startedAt: iso(-1), assignedToId: 'demo-user', assignedTo: demoUser, assignees: [], approverId: 'demo-designer', approver: demoDesignerUser, submittedForReviewAt: null, reviewedAt: iso(-1), reviewNote: 'Add the pricing table before it goes out.', relatedEntityType: 'LEAD', relatedEntityId: 'lead-1', dueDate: iso(2), createdAt: iso(-1), updatedAt: iso(-1) },
  { id: 'task-3', companyId: DEMO_COMPANY_ID, title: 'Prepare monthly report notes', description: 'Write recommendations based on content and lead conversion performance.', status: 'TODO', priority: 'MEDIUM', taskTypes: ['OTHER'], customTaskType: 'Reporting', isDraft: false, startedAt: null, assignedToId: 'demo-user', assignedTo: demoUser, assignees: [], approverId: null, approver: null, submittedForReviewAt: null, reviewedAt: null, reviewNote: null, dueDate: iso(4), createdAt: iso(-3), updatedAt: iso(-3) },
  // A step with two people side by side (parallel-steps guide 1): the designer has handed in, the copywriter is still working.
  {
    id: 'task-4', companyId: DEMO_COMPANY_ID, title: 'Launch reel: script and edit', description: 'Write the voice-over and cut the 30-second reel together, then hand it to the account manager.',
    status: 'IN_PROGRESS', priority: 'MEDIUM', taskTypes: ['REELS'], customTaskType: null, isDraft: false, startedAt: iso(-1),
    assignedToId: 'demo-copywriter', assignedTo: demoCopywriterUser, approverId: DEMO_USER_ID, approver: demoUser,
    assignees: [
      { id: 'task4-step-1a', stepOrder: 1, status: 'SUBMITTED', userId: 'demo-designer', role: 'DESIGNER', user: demoDesignerUser, approverId: DEMO_USER_ID, approver: demoUser, reachedAt: iso(-2), startedAt: iso(-2), submittedAt: iso(-1), reviewedAt: null, completedAt: null, reviewNote: null, assignedById: DEMO_USER_ID, createdAt: iso(-2) },
      { id: 'task4-step-1b', stepOrder: 1, status: 'IN_PROGRESS', userId: 'demo-copywriter', role: 'COPYWRITER', user: demoCopywriterUser, approverId: DEMO_USER_ID, approver: demoUser, reachedAt: iso(-2), startedAt: iso(-1), submittedAt: null, reviewedAt: null, completedAt: null, reviewNote: null, assignedById: DEMO_USER_ID, createdAt: iso(-2) },
      { id: 'task4-step-2', stepOrder: 2, status: 'PENDING', userId: DEMO_USER_ID, role: 'ACCOUNT_MANAGER', user: demoUser, approverId: null, approver: null, reachedAt: null, startedAt: null, submittedAt: null, reviewedAt: null, completedAt: null, reviewNote: null, assignedById: DEMO_USER_ID, createdAt: iso(-2) },
    ],
    submittedForReviewAt: null, reviewedAt: null, reviewNote: null, createdById: DEMO_USER_ID, dueDate: iso(5), createdAt: iso(-2), updatedAt: iso(-1),
  },
];

export const demoTaskComments: TaskComment[] = [
  { id: 'task-comment-1', taskId: 'task-1', body: 'CTA copy updated. Waiting for final visual export.', authorId: 'demo-user', author: demoUser, createdAt: iso(-1) },
];

export let demoTaskLogs: TaskActivityLog[] = [
  { id: 'task-log-1', taskId: 'task-1', action: 'TASK_CREATED', createdAt: iso(-2) },
  { id: 'task-log-2', taskId: 'task-1', action: 'STATUS_CHANGED_TO_IN_PROGRESS', createdAt: iso(-1) },
  // Attachment rows as the API writes them now: the name captured when it happened.
  { id: 'task-log-3', taskId: 'task-1', action: 'ATTACHMENT_ADDED', metadata: { attachmentId: 'attachment-2', kind: 'FILE', fileId: 'file-2', originalName: 'approval-flow-wireframe.pdf', label: 'Wireframe' }, createdAt: iso(-1) },
  // An older row for a link since deleted: no name was recorded, only its kind and address.
  { id: 'task-log-4', taskId: 'task-1', action: 'ATTACHMENT_ADDED', metadata: { attachmentId: 'attachment-removed', kind: 'LINK', fileId: null, url: 'https://drive.example.com/private' }, createdAt: iso(-1) },
  // A row from before metadata was recorded.
  { id: 'task-log-5', taskId: 'task-1', action: 'ATTACHMENT_ADDED', createdAt: iso(-1) },
];

export const demoReports: Report[] = [
  {
    id: 'report-1',
    companyId: DEMO_COMPANY_ID,
    month: 5,
    year: 2026,
    title: 'Monthly Report - 5/2026',
    summary: 'Content and lead activity summary for the period.',
    status: 'GENERATED',
    metrics: buildMetrics(),
    recommendations: [
      'Move approved posts into scheduled status before the weekly publishing review.',
      'Create automatic follow-up tasks for interested leads after 48 hours.',
    ],
    createdAt: iso(-5),
    updatedAt: iso(-5),
  },
];
export const demoCampaigns: Campaign[] = [
  {
    id: 'campaign-1',
    companyId: DEMO_COMPANY_ID,
    name: 'Summer Laser Offer Campaign',
    objective: 'LEADS',
    status: 'ACTIVE',
    description: 'Campaign to generate qualified bookings for summer laser packages.',
    startDate: iso(6),
    endDate: iso(36),
    budget: '750.00',
    currency: 'USD',
    targetAudience: 'Women 22-45 interested in beauty and skincare.',
    notes: 'Budget increased after initial lead quality review.',
    createdAt: iso(-1),
    updatedAt: iso(0),
  },
];

/* @__NO_SIDE_EFFECTS__ */
function employeeFrom(user: User, clients: Employee['clients']): Employee {
  return { ...user, clients };
}

export const demoEmployees: Employee[] = [
  employeeFrom(demoUser, [{ membershipId: 'demo-membership-1', companyId: DEMO_COMPANY_ID, companyName: DEMO_COMPANY_NAME, roles: ['ACCOUNT_MANAGER'], role: 'ACCOUNT_MANAGER' }]),
  {
    id: 'demo-designer',
    email: 'designer@solu1ions.com',
    fullName: 'Demo Designer',
    platformRole: 'USER',
    status: 'ACTIVE',
    createdAt: iso(-20),
    clients: [{ membershipId: 'demo-membership-2', companyId: DEMO_COMPANY_ID, companyName: DEMO_COMPANY_NAME, roles: ['DESIGNER', 'COPYWRITER'], role: 'DESIGNER' }],
  },
  // Written out rather than spread from demoCopywriterUser: a spread is a statement the
  // bundler keeps, which would carry demo data into the production build (F-06).
  {
    id: 'demo-copywriter',
    email: 'copy@solu1ions.com',
    fullName: 'Demo Copywriter',
    platformRole: 'USER',
    status: 'ACTIVE',
    createdAt: iso(-20),
    clients: [{ membershipId: 'demo-membership-4', companyId: DEMO_COMPANY_ID, companyName: DEMO_COMPANY_NAME, roles: ['COPYWRITER'], role: 'COPYWRITER' }],
  },
];

export const demoInvitations: Invitation[] = [
  { id: 'invitation-1', companyId: DEMO_COMPANY_ID, email: 'newclient@example.com', role: 'CLIENT_REVIEWER', status: 'PENDING', token: 'demo-invite-token', createdAt: iso(-1), expiresAt: iso(6) },
];

export let demoNotifications: AppNotification[] = [
  { id: 'notification-1', type: 'TASK_ASSIGNED', title: 'New task assigned', message: 'Revise launch carousel CTA was assigned to the design team.', readAt: null, relatedEntityType: 'TASK', relatedEntityId: 'task-1', createdAt: iso(-1) },
  { id: 'notification-2', type: 'POST_SUBMITTED_TO_CLIENT', title: 'Post submitted', message: 'Agency Growth OS launch teaser is ready for client review.', readAt: null, relatedEntityType: 'POST', relatedEntityId: 'post-1', createdAt: iso(-2) },
  { id: 'notification-3', type: 'LEAD_STATUS_CHANGED', title: 'Lead updated', message: 'Nour Clinic moved to Interested.', readAt: iso(-1), relatedEntityType: 'LEAD', relatedEntityId: 'lead-1', createdAt: iso(-3) },
];

export const demoNotificationPreferences: NotificationPreferences = { mutedTypes: [], emailDigest: true };

/** Demo share links, keyed by report id. The real API stores only a hash; demo keeps the token to serve /r/:token. */
export const demoReportShares = new Map<string, { token: string; createdAt: string; expiresAt: string; viewCount: number; lastViewedAt: string | null }>();

function countBy<T, K extends keyof T>(items: T[], key: K): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const value = String(item[key] ?? 'Unknown');
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

// Flat shape — matches the live GET /reports/overview response your cards read.
export function buildOverview(): ReportOverview {
  const won = demoLeads.filter((lead) => lead.status === 'WON').length;

  return {
    postsTotal: demoPosts.length,
    postsByStatus: countBy(demoPosts, 'status'),
    postsByPlatform: countBy(demoPosts, 'platform'),
    postsByContentType: countBy(demoPosts, 'contentType'),
    leadsTotal: demoLeads.length,
    leadsByStatus: countBy(demoLeads, 'status'),
    leadsBySource: countBy(demoLeads, 'source'),
    conversionRate: demoLeads.length ? won / demoLeads.length : 0,
    leadsByLostReason: buildMetrics().leads.byLostReason,
    wonValue: buildMetrics().leads.wonValue,
    recommendations: [
      'Move approved posts into scheduled status before the weekly publishing review.',
      'Create automatic follow-up tasks for interested leads after 48 hours.',
      'Use approval comments as input for the next AI caption generation prompt.',
    ],
  };
}
export function buildCampaignMetrics(): CampaignMetrics {
  const won = demoLeads.filter((lead) => lead.status === 'WON').length;
  return {
    posts: { total: demoPosts.length, byStatus: countBy(demoPosts, 'status') },
    leads: {
      total: demoLeads.length,
      byStatus: countBy(demoLeads, 'status'),
      won,
      conversionRate: demoLeads.length ? won / demoLeads.length : 0,
    },
    tasks: { total: demoTasks.length, byStatus: countBy(demoTasks, 'status') },
  };
}

// Nested shape — matches the live GET /reports/:reportId `metrics` object.
/* @__NO_SIDE_EFFECTS__ */
export function buildMetrics(): ReportMetrics {
  const won = demoLeads.filter((lead) => lead.status === 'WON').length;
  const lost = demoLeads.filter((lead) => lead.status === 'LOST').length;
  const activePipeline = demoLeads.filter((lead) => !['WON', 'LOST'].includes(lead.status ?? '')).length;

  return {
    posts: {
      total: demoPosts.length,
      approved: demoPosts.filter((post) => post.status === 'APPROVED').length,
      published: demoPosts.filter((post) => post.status === 'PUBLISHED').length,
      readyForClient: demoPosts.filter((post) => post.status === 'READY_FOR_CLIENT').length,
      changesRequested: demoPosts.filter((post) => post.status === 'CHANGES_REQUESTED').length,
      byStatus: countBy(demoPosts, 'status'),
      byPlatform: countBy(demoPosts, 'platform'),
      byContentType: countBy(demoPosts, 'contentType'),
    },
    leads: {
      total: demoLeads.length,
      won,
      lost,
      activePipeline,
      conversionRate: demoLeads.length ? won / demoLeads.length : 0,
      byStatus: countBy(demoLeads, 'status'),
      bySource: countBy(demoLeads, 'source'),
      byLostReason: demoLeads
        .filter((lead) => lead.status === 'LOST')
        .reduce<Record<string, number>>((acc, lead) => {
          const key = lead.lostReason ?? 'UNSPECIFIED';
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {}),
      wonValue: demoLeads
        .filter((lead) => lead.status === 'WON')
        .reduce((sum, lead) => sum + (Number(lead.dealValue) || 0), 0),
    },
  };
}

export function filterList<T extends { status?: string; priority?: string; type?: string; taskTypes?: string[]; source?: string; title?: string; name?: string }>(items: T[], params?: ListParams): T[] {
  return items.filter((item) => {
    if (params?.status && item.status !== params.status) return false;
    if (params?.priority && item.priority !== params.priority) return false;
    // Tasks carry several types; anything else carries one `type`.
    if (params?.type && !(item.taskTypes ? item.taskTypes.includes(params.type) : item.type === params.type)) return false;
    if (params?.source && item.source !== params.source) return false;
    if (params?.search) {
      const value = `${item.title ?? ''} ${item.name ?? ''}`.toLowerCase();
      if (!value.includes(params.search.toLowerCase())) return false;
    }
    return true;
  });
}

export function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function demoDelay<T>(value: T): Promise<T> {
  await new Promise((resolve) => window.setTimeout(resolve, 150));
  return value;
}

export function pushNotification(notification: Omit<AppNotification, 'id' | 'createdAt'>) {
  demoNotifications = [
    { id: makeId('notification'), createdAt: new Date().toISOString(), ...notification },
    ...demoNotifications,
  ];
}

/**
 * The demo's answer for a record that does not exist: a 404, like the API.
 * A bare Error carries no status, so React Query retried it twice and a
 * detail page sat on its skeleton for seconds before giving up.
 */
export function demoNotFound(message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode: 404 });
}

export function moveLeadStatus(leadId: string, status: LeadStatus) {
  const lead = demoLeads.find((item) => item.id === leadId);
  if (!lead) throw demoNotFound('Lead not found.');
  const fromStatus = lead.status;
  lead.status = status;
  lead.updatedAt = new Date().toISOString();
  demoLeadHistory = [
    { id: makeId('lead-history'), leadId, fromStatus, toStatus: status, changedById: DEMO_USER_ID, changedBy: demoUser, createdAt: new Date().toISOString() },
    ...demoLeadHistory,
  ];
  return lead;
}

export function moveTaskStatus(taskId: string, status: TaskStatus) {
  const task = demoTasks.find((item) => item.id === taskId);
  if (!task) throw demoNotFound('Task not found.');
  // The first move to IN_PROGRESS stamps `startedAt`; going back and on again never changes it.
  if ((status === 'IN_PROGRESS' || status === 'IN_REVIEW') && !task.startedAt) task.startedAt = new Date().toISOString();
  task.status = status;
  task.updatedAt = new Date().toISOString();
  demoTaskLogs = [
    { id: makeId('task-log'), taskId, action: `STATUS_CHANGED_TO_${status}`, createdAt: new Date().toISOString() },
    ...demoTaskLogs,
  ];
  return task;
}