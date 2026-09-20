import { lazy, Suspense, type ComponentType } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { AdminRoute } from '@/components/layout/RequireAdmin';
import { AgencyRoute, LandingRedirect } from '@/components/layout/AgencyRoute';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { LoadingState } from '@/components/ui/State';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

/*
  Every page behind the login is its own chunk.

  The app used to ship as one 640 KB bundle, so the login screen downloaded
  AI Studio, the admin dashboard and the employee directory before it could
  render a password field. Splitting per route means a Copywriter never
  fetches the admin pages at all, and the first paint of any page waits only
  on that page.

  Pages are named exports; `pick` adapts them to `lazy()`'s default-export
  contract without renaming anything.
*/
function pick<T extends Record<string, unknown>, K extends keyof T>(load: () => Promise<T>, key: K) {
  return lazy(() => load().then((module) => ({ default: module[key] as ComponentType })));
}

const AcceptInvitationPage = pick(() => import('@/pages/AcceptInvitationPage'), 'AcceptInvitationPage');
const DashboardPage = pick(() => import('@/pages/DashboardPage'), 'DashboardPage');
const MyWorkPage = pick(() => import('@/pages/MyWorkPage'), 'MyWorkPage');
const BrandProfilePage = pick(() => import('@/pages/BrandProfilePage'), 'BrandProfilePage');
const ContentPlansPage = pick(() => import('@/pages/ContentPlansPage'), 'ContentPlansPage');
const AiStudioPage = pick(() => import('@/pages/AiStudioPage'), 'AiStudioPage');
const PostsPage = pick(() => import('@/pages/PostsPage'), 'PostsPage');
const PostDetailPage = pick(() => import('@/pages/PostDetailPage'), 'PostDetailPage');
const LeadsPage = pick(() => import('@/pages/LeadsPage'), 'LeadsPage');
const LeadDetailPage = pick(() => import('@/pages/LeadDetailPage'), 'LeadDetailPage');
const TasksPage = pick(() => import('@/pages/TasksPage'), 'TasksPage');
const TaskDetailPage = pick(() => import('@/pages/TaskDetailPage'), 'TaskDetailPage');
const ApprovalQueuePage = pick(() => import('@/pages/ApprovalQueuePage'), 'ApprovalQueuePage');
const ReportsPage = pick(() => import('@/pages/ReportsPage'), 'ReportsPage');
const MembersPage = pick(() => import('@/pages/MembersPage'), 'MembersPage');
const NotificationsPage = pick(() => import('@/pages/NotificationsPage'), 'NotificationsPage');
const CampaignsPage = pick(() => import('@/pages/CampaignsPage'), 'CampaignsPage');
const ResponsibilitiesPage = pick(() => import('@/pages/ResponsibilitiesPage'), 'ResponsibilitiesPage');
const EmployeesPage = pick(() => import('@/pages/EmployeesPage'), 'EmployeesPage');
const ClientsPage = pick(() => import('@/pages/ClientsPage'), 'ClientsPage');
const AdminDashboardPage = pick(() => import('@/pages/admin/AdminDashboardPage'), 'AdminDashboardPage');
const ClientHomePage = pick(() => import('@/pages/ClientHomePage'), 'ClientHomePage');
const AdminActivityPage = pick(() => import('@/pages/admin/AdminActivityPage'), 'AdminActivityPage');

/** One fallback for every chunk: same spinner the pages themselves use while their data loads, so a slow network never shows two kinds of "loading". */
function PageFallback() {
  return <LoadingState label="Loading…" />;
}

export function App() {
  return (
    <Suspense fallback={<main className="auth-shell"><PageFallback /></main>}>
      <Routes>
        {/* Public. `/accept-invitation` must stay outside ProtectedRoute — an
            invitee following the emailed link has no session yet. Moving it
            inside would bounce them to /login and break the whole flow. */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/accept-invitation" element={<AcceptInvitationPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            {/* Staff land on their own work; a client lands on their Home.
                /dashboard stays the per-client overview for staff. */}
            <Route index element={<LandingRedirect />} />

            {/* Shared by staff and clients: the brand's content, plans,
                brand profile, reports and notifications. */}
            <Route path="/home" element={<ClientHomePage />} />
            <Route path="/brand-profile" element={<BrandProfilePage />} />
            <Route path="/content-plans" element={<ContentPlansPage />} />
            <Route path="/posts" element={<PostsPage />} />
            <Route path="/posts/:postId" element={<PostDetailPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />

            {/* The agency's back office. A client-side user is sent Home. */}
            <Route element={<AgencyRoute />}>
              <Route path="/my-work" element={<MyWorkPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/ai-studio" element={<AiStudioPage />} />
              <Route path="/leads" element={<LeadsPage />} />
              <Route path="/leads/:leadId" element={<LeadDetailPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
              <Route path="/approvals" element={<ApprovalQueuePage />} />
              <Route path="/campaigns" element={<CampaignsPage />} />
              <Route path="/members" element={<MembersPage />} />
              <Route path="/responsibilities" element={<ResponsibilitiesPage />} />
            </Route>
            {/* Platform admin. Guarded as a route rather than in-page so a
                USER who types the URL is sent away and the admin pages never
                mount — nothing fetches on their behalf. Cosmetic, as ever: the
                API enforces the real rule and answers 403. */}
            <Route element={<AdminRoute />}>
              <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
              <Route path="/admin/activity" element={<AdminActivityPage />} />
              <Route path="/admin/employees" element={<EmployeesPage />} />
              <Route path="/admin/clients" element={<ClientsPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="/404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </Suspense>
  );
}
