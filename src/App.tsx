import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { LoginPage } from '@/pages/LoginPage';
import { AcceptInvitationPage } from '@/pages/AcceptInvitationPage';
import { DashboardPage } from '@/pages/DashboardPage';
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
          <Route index element={<Navigate to="/dashboard" replace />} />
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
          <Route path="/admin/employees" element={<EmployeesPage />} />
          <Route path="/admin/clients" element={<ClientsPage />} />
        </Route>
      </Route>
      
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}