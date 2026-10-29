import { useRef, type ComponentType, type SVGProps } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useNotifications } from '@/context/NotificationsContext';
import { useLocale } from '@/context/LocaleContext';
import { useAuth } from '@/context/AuthContext';
import { useCan } from '@/hooks/usePermission';
import type { Permission } from '@/utils/permissions';
import { Logo } from '@/components/brand/Logo';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { isPlatformAdmin } from '@/types/domain';
import { useClientView } from '@/hooks/useClientView';
import {
  BellIcon,
  BoltIcon,
  BrandIcon,
  CampaignIcon,
  CheckAllIcon,
  ClockIcon,
  CloseIcon,
  GlobeIcon,
  LeadIcon,
  MatrixIcon,
  MembersIcon,
  OverviewIcon,
  PlanIcon,
  PostIcon,
  ReportIcon,
  SparkIcon,
  TaskIcon,
  TrendUpIcon,
} from '@/components/ui/icons';

type NavIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

interface NavItem {
  to: string;
  key: string;
  icon: NavIcon;
  /** Hide the entry from people who could not use the page. Platform admins always see it. */
  permission?: Permission;
}

interface NavGroup {
  key: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    key: 'nav.group.workspace',
    items: [
      { to: '/my-work', key: 'nav.myWork', icon: ClockIcon },
      { to: '/dashboard', key: 'nav.dashboard', icon: OverviewIcon },
      { to: '/brand-profile', key: 'nav.brandProfile', icon: BrandIcon },
    ],
  },
  {
    key: 'nav.group.content',
    items: [
      { to: '/content-plans', key: 'nav.contentPlans', icon: PlanIcon },
      { to: '/ai-studio', key: 'nav.aiStudio', icon: SparkIcon, permission: 'ai:generate' },
      { to: '/posts', key: 'nav.posts', icon: PostIcon },
      { to: '/campaigns', key: 'nav.campaigns', icon: CampaignIcon },
    ],
  },
  {
    key: 'nav.group.pipeline',
    // The lead list is Account Manager / Sales Agent in the API; offering it to anyone else is a link to a 403.
    items: [{ to: '/leads', key: 'nav.leads', icon: LeadIcon, permission: 'leads:manage' }],
  },
  {
    key: 'nav.group.delivery',
    items: [
      { to: '/tasks', key: 'nav.tasks', icon: TaskIcon },
      { to: '/approvals', key: 'nav.approvals', icon: CheckAllIcon },
      { to: '/responsibilities', key: 'nav.responsibilities', icon: MatrixIcon },
      { to: '/automations', key: 'nav.automations', icon: BoltIcon, permission: 'automations:manage' },
      { to: '/reports', key: 'nav.reports', icon: ReportIcon, permission: 'reports:view' },
    ],
  },
  {
    key: 'nav.group.admin',
    items: [
      // The member list is Account Manager (or admin) only in the API.
      { to: '/members', key: 'nav.members', icon: MembersIcon, permission: 'members:manage' },
      { to: '/notifications', key: 'nav.notifications', icon: BellIcon },
    ],
  },
];

/*
  The client portal: a Client Owner or Reviewer sees their brand and nothing
  of the agency's back office. Six entries, no groups — there is nothing to
  group.
*/
const CLIENT_NAV: NavGroup[] = [
  {
    key: 'nav.group.yourBrand',
    items: [
      { to: '/home', key: 'nav.home', icon: OverviewIcon },
      { to: '/posts', key: 'nav.posts', icon: PostIcon },
      { to: '/content-plans', key: 'nav.contentPlans', icon: PlanIcon },
      { to: '/brand-profile', key: 'nav.brandProfile', icon: BrandIcon },
      { to: '/reports', key: 'nav.reports', icon: ReportIcon, permission: 'reports:view' },
      { to: '/notifications', key: 'nav.notifications', icon: BellIcon },
    ],
  },
];

/*
  Shown to both admin roles. The operations dashboard is deliberately NOT
  behind a Super Admin check — an AGENCY_ADMIN reaches every widget on it.
*/
const PLATFORM_ADMIN_GROUP: NavGroup = {
  key: 'nav.group.platformAdmin',
  items: [
    { to: '/admin/dashboard', key: 'nav.operations', icon: TrendUpIcon },
    { to: '/admin/employees', key: 'nav.employees', icon: MembersIcon },
    { to: '/admin/clients', key: 'nav.clients', icon: GlobeIcon },
  ],
};

/** Referenced by the menu button's aria-controls. */
export const SIDEBAR_ID = 'app-sidebar';

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { unreadCount } = useNotifications();
  const { t } = useLocale();
  const { user } = useAuth();
  const { isClient } = useClientView();
  const can = useCan();
  const admin = isPlatformAdmin(user?.platformRole);
  const visible = (group: NavGroup): NavGroup => ({
    ...group,
    items: group.items.filter((item) => !item.permission || can(item.permission)),
  });
  const navGroups = (isClient ? CLIENT_NAV : admin ? [...NAV_GROUPS, PLATFORM_ADMIN_GROUP] : NAV_GROUPS).map(visible);

  /*
    Below the drawer breakpoint the open sidebar is a modal: focus moves in,
    Tab stays inside, and closing hands focus back to the menu button. `open`
    is only ever true there — the menu button is hidden on wider screens.
    Closed, CSS hides it from the tab order as well as from sight.

    A div, not an <aside> (A-4): aside cannot take role="dialog", and the
    sidebar is not complementary content. Its landmark is the "Main
    navigation" nav inside it, which is what screen readers list.
  */
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open);

  return (
    <div
      ref={ref}
      id={SIDEBAR_ID}
      className={open ? 'sidebar sidebar--open' : 'sidebar'}
      {...(open ? { role: 'dialog', 'aria-modal': true, 'aria-label': t('a11y.menu') } : {})}
    >
      {/* Plain Link, not NavLink — the brand is a shortcut home, not a nav
          item, and it should never render in the active state. "/" is the
          role-aware home (LandingRedirect): My work for staff, Home for a
          client, Operations for a platform admin with no client. It used to
          send staff to /dashboard, which is not where they land. */}
      <Link to="/" className="sidebar__brand" onClick={onClose} aria-label={t('brand.home')}>
        <Logo height={30} />
      </Link>
      <button className="icon-button mobile-only sidebar__close" type="button" onClick={onClose} aria-label={t('a11y.closeMenu')}>
        <CloseIcon size={18} />
      </button>

      <nav className="sidebar__nav" aria-label="Main navigation">
        {navGroups.map((group) => (
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
                <span className="sidebar__label">{t(key)}</span>
                {to === '/notifications' && unreadCount > 0 ? (
                  <span className="sidebar__badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                ) : null}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar__footer">{t('sidebar.footer')}</div>
    </div>
  );
}
