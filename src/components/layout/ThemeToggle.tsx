import { useLocale } from '@/context/LocaleContext';
import { useTheme, type ThemePreference } from '@/context/ThemeContext';
import { MonitorIcon, MoonIcon, SunIcon } from '@/components/ui/icons';

const ICONS: Record<ThemePreference, typeof SunIcon> = {
  light: SunIcon,
  dark: MoonIcon,
  system: MonitorIcon,
};

const LABEL_KEYS: Record<ThemePreference, string> = {
  light: 'theme.light',
  dark: 'theme.dark',
  system: 'theme.system',
};

/**
 * Cycles light → dark → system.
 *
 * The icon shows the *current* preference rather than the one clicking would
 * apply — showing the destination is a common mistake that leaves users
 * unable to tell which mode they are actually in. The accessible name states
 * both, so screen reader users get the current value and the next action.
 */
export function ThemeToggle() {
  const { preference, cycle } = useTheme();
  const { t } = useLocale();
  const Icon = ICONS[preference];

  return (
    <button
      className="icon-button"
      type="button"
      onClick={cycle}
      title={t('theme.label')}
      aria-label={`${t('theme.label')}: ${t(LABEL_KEYS[preference])}. ${t('theme.action')}`}
    >
      <Icon size={17} />
    </button>
  );
}
