import { NavLink } from 'react-router-dom';
import { useNotifications } from '@/context/NotificationsContext';
import { useLocale } from '@/context/LocaleContext';

const links = [
  { to: '/dashboard', key: 'nav.dashboard' },
  { to: '/brand-profile', key: 'nav.brandProfile' },
  { to: '/content-plans', key: 'nav.contentPlans' },
  { to: '/ai-studio', key: 'nav.aiStudio' },
  { to: '/posts', key: 'nav.posts' },
  { to: '/leads', key: 'nav.leads' },
  { to: '/tasks', key: 'nav.tasks' },
  { to: '/campaigns', key: 'nav.campaigns' },
  { to: '/reports', key: 'nav.reports' },
  { to: '/members', key: 'nav.members' },
  { to: '/notifications', key: 'nav.notifications' },
  { to: '/responsibilities', key: 'nav.responsibilities' },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { unreadCount } = useNotifications();
  const { t } = useLocale();

  return (
    <aside className={open ? 'sidebar sidebar--open' : 'sidebar'}>
      <div className="sidebar__brand">
        <span className="brand-mark">1</span>
        <div>
          <strong>Solu1ions</strong>
          <small>{t('sidebar.tagline')}</small>
        </div>
      </div>
      <nav className="sidebar__nav" aria-label="Main navigation">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            onClick={onClose}
            className={({ isActive }) => (isActive ? 'sidebar__link sidebar__link--active' : 'sidebar__link')}
          >
            <span>{t(link.key)}</span>
            {link.to === '/notifications' && unreadCount > 0 ? <span className="sidebar__badge">{unreadCount}</span> : null}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar__footer">{t('sidebar.footer')}</div>
    </aside>
  );
}