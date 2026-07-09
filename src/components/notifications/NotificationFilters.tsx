import { Field, Input, Select } from '@/components/ui/Fields';
import { Button } from '@/components/ui/Button';
import type { NotificationType } from '@/types/domain';
import { notificationTypeLabel } from './notificationMeta';

export type NotificationReadFilter = 'ALL' | 'UNREAD' | 'READ';

export interface NotificationFiltersValue {
  readStatus: NotificationReadFilter;
  type: NotificationType | 'ALL';
  search: string;
}

interface NotificationFiltersProps {
  value: NotificationFiltersValue;
  notificationTypes: NotificationType[];
  onChange: (value: NotificationFiltersValue) => void;
}

export function NotificationFilters({ value, notificationTypes, onChange }: NotificationFiltersProps) {
  const resetFilters = () => onChange({ readStatus: 'ALL', type: 'ALL', search: '' });

  return (
    <section className="notification-filters" aria-label="Notification filters">
      <Field label="Search" htmlFor="notification-search">
        <Input
          id="notification-search"
          value={value.search}
          placeholder="Search notifications"
          onChange={(event) => onChange({ ...value, search: event.target.value })}
        />
      </Field>

      <Field label="Status" htmlFor="notification-read-status">
        <Select
          id="notification-read-status"
          value={value.readStatus}
          onChange={(event) => onChange({ ...value, readStatus: event.target.value as NotificationReadFilter })}
        >
          <option value="ALL">All</option>
          <option value="UNREAD">Unread</option>
          <option value="READ">Read</option>
        </Select>
      </Field>

      <Field label="Type" htmlFor="notification-type">
        <Select
          id="notification-type"
          value={value.type}
          onChange={(event) => onChange({ ...value, type: event.target.value as NotificationType | 'ALL' })}
        >
          <option value="ALL">All types</option>
          {notificationTypes.map((type) => (
            <option key={type} value={type}>{notificationTypeLabel(type)}</option>
          ))}
        </Select>
      </Field>

      <Button variant="secondary" type="button" onClick={resetFilters}>Reset</Button>
    </section>
  );
}
