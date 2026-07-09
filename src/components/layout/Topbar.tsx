import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { Button } from '@/components/ui/Button';
import { CompanySwitcher } from '@/components/layout/CompanySwitcher';
import { LanguageToggle } from '@/components/layout/LanguageToggle';
import { NotificationsDropdown } from '@/components/notifications/NotificationsDropdown';

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, logout } = useAuth();
  const { t } = useLocale();

  return (
    <header className="topbar">
      <button className="icon-button mobile-only" type="button" onClick={onMenuClick} aria-label={t('a11y.openMenu')}>☰</button>
      <CompanySwitcher />
      <div className="topbar__spacer" />
      <LanguageToggle />
      <NotificationsDropdown />
      <div className="user-chip">
        <span>{user?.fullName ?? user?.email ?? t('common.user')}</span>
      </div>
      <Button variant="secondary" size="sm" onClick={logout}>{t('common.logout')}</Button>
    </header>
  );
}