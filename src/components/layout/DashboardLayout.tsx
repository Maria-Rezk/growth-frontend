import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { CompanyProvider } from '@/context/CompanyContext';
import { NotificationsProvider } from '@/context/NotificationsContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { WaitingBanner } from '@/components/layout/WaitingBanner';
import { LoadingState } from '@/components/ui/State';
import { useScrollRestoration } from '@/hooks/useScrollRestoration';

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // One place for every authenticated page: a refresh or Back returns to
  // where the person was on that exact URL instead of snapping to the top.
  useScrollRestoration();

  // The mobile drawer closes on any navigation (not only a sidebar click: the
  // command palette, a toast link, Back) and on Escape, like any other overlay.
  const { pathname } = useLocation();
  useEffect(() => { setSidebarOpen(false); }, [pathname]);
  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setSidebarOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);
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
