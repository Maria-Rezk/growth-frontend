import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useLocale } from '@/context/LocaleContext';
import type { AppLanguage } from '@/i18n/messages';

export function LanguageToggle() {
  const { lang, setLang, t } = useLocale();
  return (
    <SegmentedControl<AppLanguage>
      label={t('common.language')}
      value={lang}
      onChange={setLang}
      options={[
        { label: 'EN', value: 'en' },
        { label: 'ع', value: 'ar' },
      ]}
    />
  );
}