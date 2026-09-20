import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { Button } from '@/components/ui/Button';
import { CompanySwitcher } from '@/components/layout/CompanySwitcher';
import { LanguageToggle } from '@/components/layout/LanguageToggle';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { NotificationsDropdown } from '@/components/notifications/NotificationsDropdown';
import { LogoutIcon, MenuIcon } from '@/components/ui/icons';
import { env } from '@/config/env';

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, logout } = useAuth();
  const { t } = useLocale();

  return (
    <header className="topbar">
      <button className="icon-button mobile-only" type="button" onClick={onMenuClick} aria-label={t('a11y.openMenu')}>
        <MenuIcon size={18} />
      </button>

      <CompanySwitcher />

      <div className="topbar__spacer" />

      <CommandPalette />
      {env.arabicEnabled ? <LanguageToggle /> : null}
      <ThemeToggle />
      <NotificationsDropdown />

      <span className="topbar__divider" aria-hidden="true" />

      <span className="user-chip" title={user?.fullName ?? user?.email ?? undefined}>
        {user?.fullName ?? user?.email ?? t('common.user')}
      </span>

      <Button variant="ghost" size="sm" onClick={logout} aria-label={t('common.logout')}>
        <LogoutIcon size={15} />
        {/* Label hides under 760px; the aria-label keeps the button named. */}
        <span className="btn__label">{t('common.logout')}</span>
      </Button>
    </header>
  );
}
