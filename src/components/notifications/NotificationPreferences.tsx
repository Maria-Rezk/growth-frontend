import { useNotifications } from '@/context/NotificationsContext';
import { Card, CardHeader } from '@/components/ui/Card';
import type { NotificationType } from '@/types/domain';
import { NOTIFICATION_TYPES, notificationToneLabel, notificationTypeLabel } from './notificationMeta';

/**
 * Which notifications reach me.
 *
 * One switch per type, grouped the way the feed groups them. Muting a type
 * removes it from the bell, the dropdown and the page — the digest email is
 * the backend's, and this is the list it will read once preferences are
 * stored server-side. Until then they are kept on this device.
 */
export function NotificationPreferences() {
  const { muted, setMuted } = useNotifications();

  const groups = new Map<string, NotificationType[]>();
  NOTIFICATION_TYPES.forEach((type) => {
    const label = notificationToneLabel(type);
    groups.set(label, [...(groups.get(label) ?? []), type]);
  });

  return (
    <Card>
      <CardHeader
        title="What reaches you"
        subtitle={`Switch off anything you do not need. ${muted.size ? `${muted.size} muted.` : 'Everything is on.'} Saved on this device.`}
      />
      <div className="content-card__body prefs-grid">
        {[...groups.entries()].map(([group, types]) => (
          <fieldset key={group} className="prefs-group">
            <legend className="eyebrow">{group}</legend>
            {types.map((type) => {
              const id = `pref-${type}`;
              return (
                <label key={type} htmlFor={id} className="checkbox-row prefs-row">
                  <input
                    id={id}
                    type="checkbox"
                    checked={!muted.has(type)}
                    onChange={(event) => setMuted(type, !event.target.checked)}
                  />
                  <span>{notificationTypeLabel(type)}</span>
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
    </Card>
  );
}
