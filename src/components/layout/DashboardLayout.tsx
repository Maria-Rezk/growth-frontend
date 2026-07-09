import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { CompanyProvider } from '@/context/CompanyContext';
import { NotificationsProvider } from '@/context/NotificationsContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';

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
            <main id="main-content" className="page-container" tabIndex={-1}>
              <Outlet />
            </main>
          </div>
        </div>
      </NotificationsProvider>
    </CompanyProvider>
  );
}
