export const apiRoutes = {
  auth: {
    login: '/auth/login',
    me: '/auth/me',
    // Exchanges the httpOnly refresh cookie for a new access token, re-issuing
    // the role along with it — which is what makes Flow 7 actually resolve.
    refresh: '/auth/refresh',
    acceptInvitation: '/auth/accept-invitation',
  },
  users: {
    list: '/users',
    create: '/users',
    detail: (userId: string) => `/users/${userId}`,
    update: (userId: string) => `/users/${userId}`,
    // Super Admin only. Separate from `update` on purpose — the general user
    // PATCH rejects `platformRole` outright (forbidNonWhitelisted → 400).
    platformRole: (userId: string) => `/users/${userId}/platform-role`,
  },
  companies: {
    list: '/companies',
    create: '/companies',
    // PATCH (rename / archive) and DELETE (Super Admin, permanent) share this.
    detail: (companyId: string) => `/companies/${companyId}`,
    members: (companyId: string) => `/companies/${companyId}/members`,
    member: (companyId: string, membershipId: string) => `/companies/${companyId}/members/${membershipId}`,
  },
  /*
    Admin & Super Admin operations dashboard.

    Every `dashboard.*` route is a GET, accepts the shared filter set, is open
    to AGENCY_ADMIN and SUPER_ADMIN, and is fetched independently so one slow
    query degrades a single card instead of the page. `system.health` is the
    one Super-Admin-only read.
  */
  admin: {
    dashboard: {
      overview: '/admin/dashboard/overview',
      attention: '/admin/dashboard/attention',
      content: '/admin/dashboard/content',
      approvals: '/admin/dashboard/approvals',
      tasks: '/admin/dashboard/tasks',
      teamWorkload: '/admin/dashboard/team-workload',
      leads: '/admin/dashboard/leads',
      overdueLeads: '/admin/dashboard/leads/overdue',
      campaigns: '/admin/dashboard/campaigns',
      contentPlans: '/admin/dashboard/content-plans',
      clients: '/admin/dashboard/clients',
      automations: '/admin/dashboard/automations',
      activity: '/admin/dashboard/activity',
    },
    system: {
      health: '/admin/system/health',
    },
  },
  brandProfile: (companyId: string) => `/companies/${companyId}/brand-profile`,
  contentPlans: {
    list: (companyId: string) => `/companies/${companyId}/content-plans`,
    create: (companyId: string) => `/companies/${companyId}/content-plans`,
  },
  posts: {
    list: (companyId: string) => `/companies/${companyId}/posts`,
    detail: (companyId: string, postId: string) => `/companies/${companyId}/posts/${postId}`,
    comments: (companyId: string, postId: string) => `/companies/${companyId}/posts/${postId}/comments`,
    assets: (companyId: string, postId: string) => `/companies/${companyId}/posts/${postId}/assets`,
    asset: (companyId: string, postId: string, assetId: string) => `/companies/${companyId}/posts/${postId}/assets/${assetId}`,
    submitReview: (companyId: string, postId: string) => `/companies/${companyId}/posts/${postId}/submit-review`,
    approve: (companyId: string, postId: string) => `/companies/${companyId}/posts/${postId}/approve`,
    requestChanges: (companyId: string, postId: string) => `/companies/${companyId}/posts/${postId}/request-changes`,
    reject: (companyId: string, postId: string) => `/companies/${companyId}/posts/${postId}/reject`,
    publish: (companyId: string, postId: string) => `/companies/${companyId}/posts/${postId}/publish`,
    approvalLogs: (companyId: string, postId: string) => `/companies/${companyId}/posts/${postId}/approval-logs`,
  },
  files: {
    upload: (companyId: string) => `/companies/${companyId}/files/upload`,
    detail: (companyId: string, fileId: string) => `/companies/${companyId}/files/${fileId}`,
    downloadUrl: (companyId: string, fileId: string) => `/companies/${companyId}/files/${fileId}/download-url`,
  },
  leads: {
    list: (companyId: string) => `/companies/${companyId}/leads`,
    detail: (companyId: string, leadId: string) => `/companies/${companyId}/leads/${leadId}`,
    status: (companyId: string, leadId: string) => `/companies/${companyId}/leads/${leadId}/status`,
    notes: (companyId: string, leadId: string) => `/companies/${companyId}/leads/${leadId}/notes`,
    statusHistory: (companyId: string, leadId: string) => `/companies/${companyId}/leads/${leadId}/status-history`,
  },
  reports: {
    overview: (companyId: string) => `/companies/${companyId}/reports/overview`,
    monthly: (companyId: string) => `/companies/${companyId}/reports/monthly`,
    list: (companyId: string) => `/companies/${companyId}/reports`,
    detail: (companyId: string, reportId: string) => `/companies/${companyId}/reports/${reportId}`,
  },
  tasks: {
    list: (companyId: string) => `/companies/${companyId}/tasks`,
    detail: (companyId: string, taskId: string) => `/companies/${companyId}/tasks/${taskId}`,
    status: (companyId: string, taskId: string) => `/companies/${companyId}/tasks/${taskId}/status`,
    comments: (companyId: string, taskId: string) => `/companies/${companyId}/tasks/${taskId}/comments`,
    attachments: (companyId: string, taskId: string) => `/companies/${companyId}/tasks/${taskId}/attachments`,
    attachment: (companyId: string, taskId: string, attachmentId: string) => `/companies/${companyId}/tasks/${taskId}/attachments/${attachmentId}`,
    activityLogs: (companyId: string, taskId: string) => `/companies/${companyId}/tasks/${taskId}/activity-logs`,
    myTasks: (companyId: string) => `/companies/${companyId}/tasks/my`,
  },
  invitations: {
    list: (companyId: string) => `/companies/${companyId}/invitations`,
    create: (companyId: string) => `/companies/${companyId}/invitations`,
  },
  campaigns: {
    list: (companyId: string) => `/companies/${companyId}/campaigns`,
    detail: (companyId: string, campaignId: string) => `/companies/${companyId}/campaigns/${campaignId}`,
    status: (companyId: string, campaignId: string) => `/companies/${companyId}/campaigns/${campaignId}/status`,
    overview: (companyId: string, campaignId: string) => `/companies/${companyId}/campaigns/${campaignId}/overview`,
    // Attach (POST) and detach (DELETE) share these paths.
    post: (companyId: string, campaignId: string, postId: string) => `/companies/${companyId}/campaigns/${campaignId}/posts/${postId}`,
    lead: (companyId: string, campaignId: string, leadId: string) => `/companies/${companyId}/campaigns/${campaignId}/leads/${leadId}`,
    task: (companyId: string, campaignId: string, taskId: string) => `/companies/${companyId}/campaigns/${campaignId}/tasks/${taskId}`,
  },
  ai: {
    contentPlanPreview: (companyId: string) => `/companies/${companyId}/ai/content-plan-preview`,
    postIdeas: (companyId: string) => `/companies/${companyId}/ai/post-ideas`,
    caption: (companyId: string) => `/companies/${companyId}/ai/caption`,
    generations: (companyId: string) => `/companies/${companyId}/ai/generations`,
    generation: (companyId: string, generationId: string) => `/companies/${companyId}/ai/generations/${generationId}`,
    applyContentPlan: (companyId: string, generationId: string) => `/companies/${companyId}/ai/generations/${generationId}/apply-content-plan`,
    applyCaption: (companyId: string, generationId: string) => `/companies/${companyId}/ai/generations/${generationId}/apply-caption`,
    applyPostIdea: (companyId: string, generationId: string) => `/companies/${companyId}/ai/generations/${generationId}/apply-post-idea`,
  },
  notifications: {
    list: '/notifications',
    unreadCount: '/notifications/unread-count',
    markAllRead: '/notifications/read-all',
    markRead: (notificationId: string) => `/notifications/${notificationId}/read`,
  },
  responsibilities: {
    areas: (companyId: string) => `/companies/${companyId}/responsibility-areas`,
    area: (companyId: string, areaId: string) => `/companies/${companyId}/responsibility-areas/${areaId}`,
    assignments: (companyId: string) => `/companies/${companyId}/responsibility-assignments`,
    assignment: (companyId: string, assignmentId: string) => `/companies/${companyId}/responsibility-assignments/${assignmentId}`,
    bulk: (companyId: string) => `/companies/${companyId}/responsibility-assignments/bulk`,
    matrix: (companyId: string) => `/companies/${companyId}/responsibility-assignments/matrix`,
  },
} as const;