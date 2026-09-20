import type {
  AppNotification,
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
  PostApprovalLog,
  PostAsset,
  PostComment,
  Report,
  ReportMetrics,
  ReportOverview,
  StoredFile,
  Task,
  TaskActivityLog,
  TaskAttachment,
  TaskComment,
  TaskStatus,
  User,
  Campaign,
  CampaignMetrics,
} from '@/types/domain';

const today = new Date();
const iso = (offsetDays = 0) => {
  const date = new Date(today);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString();
};

export const demoUser: User = {
  id: 'demo-user',
  email: 'demo@solu1ions.com',
  fullName: 'Demo User',
  platformRole: 'SUPER_ADMIN',
  status: 'ACTIVE',
  createdAt: iso(-30),
};

export const demoCompany: Company = {
  id: 'demo-company',
  name: 'Solu1ions Demo Workspace',
  createdAt: iso(-90),
};

export const demoMemberships: Membership[] = [
  {
    id: 'demo-membership-1',
    companyId: demoCompany.id,
    userId: demoUser.id,
    roles: ['ACCOUNT_MANAGER'],
    role: 'ACCOUNT_MANAGER',
    status: 'ACTIVE',
    user: demoUser,
    company: demoCompany,
  },
  {
    id: 'demo-membership-2',
    companyId: demoCompany.id,
    userId: 'demo-designer',
    roles: ['DESIGNER', 'COPYWRITER'],
    role: 'DESIGNER',
    status: 'ACTIVE',
    user: { id: 'demo-designer', email: 'designer@solu1ions.com', fullName: 'Demo Designer' },
    company: demoCompany,
  },
  {
    id: 'demo-membership-3',
    companyId: demoCompany.id,
    userId: 'demo-client',
    roles: ['CLIENT_REVIEWER'],
    role: 'CLIENT_REVIEWER',
    status: 'ACTIVE',
    user: { id: 'demo-client', email: 'client@example.com', fullName: 'Client Reviewer' },
    company: demoCompany,
  },
];

export let demoBrandProfile: BrandProfile = {
  id: 'demo-brand-profile',
  companyId: demoCompany.id,
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

export let demoContentPlans: ContentPlan[] = [
  { id: 'plan-1', companyId: demoCompany.id, title: 'June Growth Content Plan', month: 6, year: 2026, createdAt: iso(-7) },
];

export let demoPosts: ContentPost[] = [
  {
    id: 'post-1',
    companyId: demoCompany.id,
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
    companyId: demoCompany.id,
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
    companyId: demoCompany.id,
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

export let demoPostComments: PostComment[] = [
  { id: 'post-comment-1', postId: 'post-1', body: 'Looks clear. Please make the CTA stronger.', authorId: 'demo-client', author: demoMemberships[2].user, createdAt: iso(-1) },
  { id: 'post-comment-2', postId: 'post-1', body: 'I will revise the last slide and send it back for approval.', authorId: 'demo-user', author: demoUser, createdAt: iso(0) },
];

export let demoPostLogs: PostApprovalLog[] = [
  { id: 'approval-log-1', postId: 'post-1', action: 'SUBMITTED_TO_CLIENT', actorId: 'demo-user', actor: demoUser, createdAt: iso(-2) },
  { id: 'approval-log-2', postId: 'post-1', action: 'CLIENT_COMMENTED', actorId: 'demo-client', actor: demoMemberships[2].user, note: 'CTA needs refinement.', createdAt: iso(-1) },
];

export let demoFiles: StoredFile[] = [
  { id: 'file-1', companyId: demoCompany.id, originalName: 'launch-carousel-v1.png', filename: 'launch-carousel-v1.png', mimeType: 'image/png', size: 248000, createdAt: iso(-1) },
  { id: 'file-2', companyId: demoCompany.id, originalName: 'approval-flow-wireframe.pdf', filename: 'approval-flow-wireframe.pdf', mimeType: 'application/pdf', size: 512000, createdAt: iso(-2) },
];

export let demoPostAssets: PostAsset[] = [
  { id: 'asset-1', postId: 'post-1', fileId: 'file-1', file: demoFiles[0], createdAt: iso(-1) },
];

export let demoLeads: Lead[] = [
  { id: 'lead-1', companyId: demoCompany.id, name: 'Nour Clinic', email: 'hello@nourclinic.com', phone: '+963 999 111 222', source: 'Instagram DM', status: 'INTERESTED', assignedToId: 'demo-user', assignedTo: demoUser, createdAt: iso(-10), updatedAt: iso(-1) },
  { id: 'lead-2', companyId: demoCompany.id, name: 'Alpha Retail', email: 'contact@alpharetail.com', phone: '+963 999 333 444', source: 'Website', status: 'CONTACTED', assignedToId: 'demo-user', assignedTo: demoUser, createdAt: iso(-5), updatedAt: iso(-2) },
  { id: 'lead-3', companyId: demoCompany.id, name: 'Daleel Chicago', source: 'Referral', status: 'NEW', createdAt: iso(-1), updatedAt: iso(-1) },
];

export let demoLeadNotes: LeadNote[] = [
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

export let demoTasks: Task[] = [
  { id: 'task-1', companyId: demoCompany.id, title: 'Revise launch carousel CTA', description: 'Update the final slide CTA and prepare the asset for client approval.', status: 'IN_REVIEW', priority: 'HIGH', type: 'DESIGN', assignedToId: 'demo-designer', assignedTo: demoMemberships[1].user, approverId: demoUser.id, approver: demoUser, submittedForReviewAt: iso(-1), reviewedAt: null, reviewNote: null, relatedEntityType: 'POST', relatedEntityId: 'post-1', dueDate: iso(1), createdAt: iso(-2), updatedAt: iso(-1) },
  { id: 'task-2', companyId: demoCompany.id, title: 'Follow up with Nour Clinic', description: 'Send proposal summary and confirm decision timeline.', status: 'IN_PROGRESS', priority: 'URGENT', type: 'FOLLOW_UP', assignedToId: 'demo-user', assignedTo: demoUser, approverId: 'demo-designer', approver: demoMemberships[1].user, submittedForReviewAt: null, reviewedAt: iso(-1), reviewNote: 'Add the pricing table before it goes out.', relatedEntityType: 'LEAD', relatedEntityId: 'lead-1', dueDate: iso(2), createdAt: iso(-1), updatedAt: iso(-1) },
  { id: 'task-3', companyId: demoCompany.id, title: 'Prepare monthly report notes', description: 'Write recommendations based on content and lead conversion performance.', status: 'TODO', priority: 'MEDIUM', type: 'REPORTING', assignedToId: 'demo-user', assignedTo: demoUser, approverId: null, approver: null, submittedForReviewAt: null, reviewedAt: null, reviewNote: null, dueDate: iso(4), createdAt: iso(-3), updatedAt: iso(-3) },
];

export let demoTaskComments: TaskComment[] = [
  { id: 'task-comment-1', taskId: 'task-1', body: 'CTA copy updated. Waiting for final visual export.', authorId: 'demo-user', author: demoUser, createdAt: iso(-1) },
];

export let demoTaskLogs: TaskActivityLog[] = [
  { id: 'task-log-1', taskId: 'task-1', action: 'TASK_CREATED', createdAt: iso(-2) },
  { id: 'task-log-2', taskId: 'task-1', action: 'STATUS_CHANGED_TO_IN_PROGRESS', createdAt: iso(-1) },
];

export let demoTaskAttachments: TaskAttachment[] = [
  { id: 'task-attachment-1', taskId: 'task-1', fileId: 'file-2', file: demoFiles[1], createdAt: iso(-1) },
];

export let demoReports: Report[] = [
  {
    id: 'report-1',
    companyId: demoCompany.id,
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
export let demoCampaigns: Campaign[] = [
  {
    id: 'campaign-1',
    companyId: demoCompany.id,
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

export let demoEmployees: Employee[] = [
  {
    ...demoUser,
    clients: [{ membershipId: demoMemberships[0].id, companyId: demoCompany.id, companyName: demoCompany.name, roles: ['ACCOUNT_MANAGER'], role: 'ACCOUNT_MANAGER' }],
  },
  {
    id: 'demo-designer',
    email: 'designer@solu1ions.com',
    fullName: 'Demo Designer',
    platformRole: 'USER',
    status: 'ACTIVE',
    createdAt: iso(-20),
    clients: [{ membershipId: demoMemberships[1].id, companyId: demoCompany.id, companyName: demoCompany.name, roles: ['DESIGNER', 'COPYWRITER'], role: 'DESIGNER' }],
  },
];

export let demoInvitations: Invitation[] = [
  { id: 'invitation-1', companyId: demoCompany.id, email: 'newclient@example.com', role: 'CLIENT_REVIEWER', status: 'PENDING', token: 'demo-invite-token', createdAt: iso(-1), expiresAt: iso(6) },
];

export let demoNotifications: AppNotification[] = [
  { id: 'notification-1', type: 'TASK_ASSIGNED', title: 'New task assigned', message: 'Revise launch carousel CTA was assigned to the design team.', readAt: null, relatedEntityType: 'TASK', relatedEntityId: 'task-1', createdAt: iso(-1) },
  { id: 'notification-2', type: 'POST_SUBMITTED_TO_CLIENT', title: 'Post submitted', message: 'Agency Growth OS launch teaser is ready for client review.', readAt: null, relatedEntityType: 'POST', relatedEntityId: 'post-1', createdAt: iso(-2) },
  { id: 'notification-3', type: 'LEAD_STATUS_CHANGED', title: 'Lead updated', message: 'Nour Clinic moved to Interested.', readAt: iso(-1), relatedEntityType: 'LEAD', relatedEntityId: 'lead-1', createdAt: iso(-3) },
];

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
    },
  };
}

export function filterList<T extends { status?: string; priority?: string; type?: string; source?: string; title?: string; name?: string }>(items: T[], params?: ListParams): T[] {
  return items.filter((item) => {
    if (params?.status && item.status !== params.status) return false;
    if (params?.priority && item.priority !== params.priority) return false;
    if (params?.type && item.type !== params.type) return false;
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

export function moveLeadStatus(leadId: string, status: LeadStatus) {
  const lead = demoLeads.find((item) => item.id === leadId);
  if (!lead) throw new Error('Lead not found.');
  const fromStatus = lead.status;
  lead.status = status;
  lead.updatedAt = new Date().toISOString();
  demoLeadHistory = [
    { id: makeId('lead-history'), leadId, fromStatus, toStatus: status, changedById: demoUser.id, changedBy: demoUser, createdAt: new Date().toISOString() },
    ...demoLeadHistory,
  ];
  return lead;
}

export function moveTaskStatus(taskId: string, status: TaskStatus) {
  const task = demoTasks.find((item) => item.id === taskId);
  if (!task) throw new Error('Task not found.');
  task.status = status;
  task.updatedAt = new Date().toISOString();
  demoTaskLogs = [
    { id: makeId('task-log'), taskId, action: `STATUS_CHANGED_TO_${status}`, createdAt: new Date().toISOString() },
    ...demoTaskLogs,
  ];
  return task;
}