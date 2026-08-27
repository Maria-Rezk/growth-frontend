import { ActivityFeed } from '@/components/admin/ActivityFeed';
import { AdminFilterBar } from '@/components/admin/AdminFilterBar';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/Card';
import { FilterBar } from '@/components/ui/FilterBar';
import { Field, Select } from '@/components/ui/Fields';
import { appRoutes } from '@/config/appRoutes';
import { useAsync } from '@/hooks/useAsync';
import { useDashboardFilters, useUrlParam } from '@/hooks/useDashboardFilters';
import { queryKeys } from '@/lib/queryClient';
import { usersService } from '@/services/users';
import { humanize } from '@/utils/format';
import type { DashboardFilters } from '@/types/domain';

/**
 * Entity types the activity feed reports today.
 *
 * An open set, like `action` — the picker is a convenience for the common
 * cases, and an unrecognised `entityType` arriving from the server still
 * renders in the feed. Nothing here filters rows out client-side.
 */
const ENTITY_TYPES = ['POST', 'TASK', 'LEAD', 'CAMPAIGN', 'CLIENT', 'USER', 'MEMBERSHIP'] as const;

/**
 * Full-page audit view over `/admin/dashboard/activity`.
 *
 * The dashboard shows the same endpoint as a compact sidebar feed; this screen
 * adds the two parameters that feed does not carry — `userId` (who did it) and
 * `entityType` (what they did it to) — and a larger page size. Both live in
 * the URL, so a filtered audit trail is a link someone can send.
 */
export function AdminActivityPage() {
  const { filters, setFilters, resetFilters } = useDashboardFilters();
  const [actorId, setActorId] = useUrlParam('userId');
  const [entityType, setEntityType] = useUrlParam('entityType');

  const employees = useAsync(() => usersService.list(), [], { queryKey: queryKeys.employees });

  const activityFilters: DashboardFilters = { ...filters, userId: actorId, entityType };

  return (
    <>
      <PageHeader
        title="Activity log"
        subtitle="Every action across the agency, including client administration and role changes."
        action={<ButtonLink to={appRoutes.adminDashboard} variant="secondary" size="sm">Back to dashboard</ButtonLink>}
      />

      <AdminFilterBar filters={filters} onChange={setFilters} onReset={resetFilters} />

      <FilterBar>
        <div className="admin-filter-bar__fields">
          <Field label="Performed by" htmlFor="activity-actor">
            <Select
              id="activity-actor"
              value={actorId ?? ''}
              onChange={(event) => setActorId(event.target.value || undefined)}
            >
              <option value="">Anyone</option>
              {(employees.data ?? []).map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.fullName ?? employee.email}</option>
              ))}
            </Select>
          </Field>
          <Field label="Entity type" htmlFor="activity-entity">
            <Select
              id="activity-entity"
              value={entityType ?? ''}
              onChange={(event) => setEntityType(event.target.value || undefined)}
            >
              <option value="">Everything</option>
              {ENTITY_TYPES.map((type) => (
                <option key={type} value={type}>{humanize(type)}</option>
              ))}
            </Select>
          </Field>
        </div>
      </FilterBar>

      <ActivityFeed filters={activityFilters} limit={25} />
    </>
  );
}
