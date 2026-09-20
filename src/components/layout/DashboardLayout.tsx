import { Suspense, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { CompanyProvider } from '@/context/CompanyContext';
import { NotificationsProvider } from '@/context/NotificationsContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { WaitingBanner } from '@/components/layout/WaitingBanner';
import { LoadingState } from '@/components/ui/State';

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <CompanyProvider>
      <NotificationsProvider>
        <div className="app-shell">
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          {sidebarOpen ? <button className="sidebar-scrim" type="button" onClick={() => setSidebarOpen(false)} aria-label="Close menu" /> : null}
          <div className="main-shell">
            <Topbar onMenuClick={() => setSidebarOpen(true)} />
            <WaitingBanner />
            <main id="main-content" className="page-container" tabIndex={-1}>
              {/* Inside the shell on purpose: a page chunk loading must not
                  unmount the sidebar and topbar around it. */}
              <Suspense fallback={<LoadingState label="Loading…" />}>
                <Outlet />
              </Suspense>
            </main>
          </div>
        </div>
      </NotificationsProvider>
    </CompanyProvider>
  );
}
