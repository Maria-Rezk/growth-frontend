import { Card, CardHeader } from '@/components/ui/Card';
import { useNotifications } from '@/context/NotificationsContext';

/** The daily digest switch. Muted types are also left out of the email. */
export function EmailDigestPreference() {
  const { preferences, preferencesLoading, preferencesError, savePreferences, saving, saveError } = useNotifications();

  return (
    <Card>
      <CardHeader
        title="Daily email digest"
        subtitle="One email at 08:00, and only when something is waiting on you: a review, work sent back to you, or a post awaiting your approval."
      />
      <div className="content-card__body stack-list">
        {preferencesLoading ? <p className="muted">Loading your preferences…</p> : null}
        {preferencesError ? <p className="error-box" role="alert">{preferencesError}</p> : null}
        {preferences ? (
          <label htmlFor="pref-email-digest" className="checkbox-row prefs-row">
            <input
              id="pref-email-digest"
              type="checkbox"
              checked={preferences.emailDigest}
              disabled={saving}
              onChange={(event) => void savePreferences({ ...preferences, emailDigest: event.target.checked })}
            />
            <span>Send me the daily digest</span>
          </label>
        ) : null}
        {saveError ? <p className="error-box" role="alert">Not saved: {saveError}</p> : null}
      </div>
    </Card>
  );
}
