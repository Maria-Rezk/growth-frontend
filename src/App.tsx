import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { AdminRoute } from '@/components/layout/RequireAdmin';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { LoginPage } from '@/pages/LoginPage';
import { AcceptInvitationPage } from '@/pages/AcceptInvitationPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { MyWorkPage } from '@/pages/MyWorkPage';
import { BrandProfilePage } from '@/pages/BrandProfilePage';
import { ContentPlansPage } from '@/pages/ContentPlansPage';
import { AiStudioPage } from '@/pages/AiStudioPage';
import { PostsPage } from '@/pages/PostsPage';
import { PostDetailPage } from '@/pages/PostDetailPage';
import { LeadsPage } from '@/pages/LeadsPage';
import { LeadDetailPage } from '@/pages/LeadDetailPage';
import { TasksPage } from '@/pages/TasksPage';
import { TaskDetailPage } from '@/pages/TaskDetailPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { MembersPage } from '@/pages/MembersPage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { CampaignsPage } from '@/pages/CampaignsPage';
import { ResponsibilitiesPage } from '@/pages/ResponsibilitiesPage';
import { EmployeesPage } from '@/pages/EmployeesPage';
import { ClientsPage } from '@/pages/ClientsPage';
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage';
import { AdminActivityPage } from '@/pages/admin/AdminActivityPage';

export function App() {
  return (
    <Routes>
      {/* Public. `/accept-invitation` must stay outside ProtectedRoute — an
          invitee following the emailed link has no session yet. Moving it
          inside would bounce them to /login and break the whole flow. */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/accept-invitation" element={<AcceptInvitationPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          {/* An employee lands on their own work, not on a client they
              first have to choose. /dashboard stays the per-client overview. */}
          <Route index element={<Navigate to="/my-work" replace />} />
          <Route path="/my-work" element={<MyWorkPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/brand-profile" element={<BrandProfilePage />} />
          <Route path="/content-plans" element={<ContentPlansPage />} />
          <Route path="/ai-studio" element={<AiStudioPage />} />
          <Route path="/posts" element={<PostsPage />} />
          <Route path="/posts/:postId" element={<PostDetailPage />} />
          <Route path="/leads" element={<LeadsPage />} />
          <Route path="/leads/:leadId" element={<LeadDetailPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
          <Route path="/campaigns" element={<CampaignsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/members" element={<MembersPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/responsibilities" element={<ResponsibilitiesPage />} />
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
  );
}