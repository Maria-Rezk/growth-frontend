import type { ComponentType, SVGProps } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useNotifications } from '@/context/NotificationsContext';
import { useLocale } from '@/context/LocaleContext';
import { Logo } from '@/components/brand/Logo';
import {
  BellIcon,
  BrandIcon,
  CampaignIcon,
  LeadIcon,
  MatrixIcon,
  MembersIcon,
  OverviewIcon,
  PlanIcon,
  PostIcon,
  ReportIcon,
  SparkIcon,
  TaskIcon,
} from '@/components/ui/icons';

type NavIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

interface NavItem {
  to: string;
  key: string;
  icon: NavIcon;
}

interface NavGroup {
  key: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    key: 'nav.group.workspace',
    items: [
      { to: '/dashboard', key: 'nav.dashboard', icon: OverviewIcon },
      { to: '/brand-profile', key: 'nav.brandProfile', icon: BrandIcon },
    ],
  },
  {
    key: 'nav.group.content',
    items: [
      { to: '/content-plans', key: 'nav.contentPlans', icon: PlanIcon },
      { to: '/ai-studio', key: 'nav.aiStudio', icon: SparkIcon },
      { to: '/posts', key: 'nav.posts', icon: PostIcon },
      { to: '/campaigns', key: 'nav.campaigns', icon: CampaignIcon },
    ],
  },
  {
    key: 'nav.group.pipeline',
    items: [{ to: '/leads', key: 'nav.leads', icon: LeadIcon }],
  },
  {
    key: 'nav.group.delivery',
    items: [
      { to: '/tasks', key: 'nav.tasks', icon: TaskIcon },
      { to: '/responsibilities', key: 'nav.responsibilities', icon: MatrixIcon },
      { to: '/reports', key: 'nav.reports', icon: ReportIcon },
    ],
  },
  {
    key: 'nav.group.admin',
    items: [
      { to: '/members', key: 'nav.members', icon: MembersIcon },
      { to: '/notifications', key: 'nav.notifications', icon: BellIcon },
    ],
  },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { unreadCount } = useNotifications();
  const { t } = useLocale();

  return (
    <aside className={open ? 'sidebar sidebar--open' : 'sidebar'}>
      {/* Plain Link, not NavLink — the brand is a shortcut home, not a nav
          item, and it should never render in the active state. */}
      <Link to="/dashboard" className="sidebar__brand" onClick={onClose} aria-label={t('brand.home')}>
        <Logo height={30} />
      </Link>

      <nav className="sidebar__nav" aria-label="Main navigation">
        {NAV_GROUPS.map((group) => (
          <div key={group.key} className="sidebar__group">
            <p className="sidebar__group-label">{t(group.key)}</p>
            {group.items.map(({ to, key, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={onClose}
                className={({ isActive }) => (isActive ? 'sidebar__link sidebar__link--active' : 'sidebar__link')}
              >
                <Icon />
                <span>{t(key)}</span>
                {to === '/notifications' && unreadCount > 0 ? (
                  <span className="sidebar__badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                ) : null}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar__footer">{t('sidebar.footer')}</div>
    </aside>
  );
}
