import { Button } from '@/components/ui/Button';
import { FilterBar } from '@/components/ui/FilterBar';
import { Field, Input, Select } from '@/components/ui/Fields';
import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { companiesService } from '@/services/companies';
import { usersService } from '@/services/users';
import { daysAgo, today } from '@/utils/dashboardFilters';
import type { SharedFilters } from '@/hooks/useDashboardFilters';

interface QuickRange {
  label: string;
  from: () => string;
  to: () => string;
}

const QUICK_RANGES: QuickRange[] = [
  { label: 'Today', from: today, to: today },
  { label: 'Last 7 days', from: () => daysAgo(6), to: today },
  { label: 'Last 30 days', from: () => daysAgo(29), to: today },
];

/**
 * The one filter bar every widget reads from.
 *
 * The client dropdown is a convenience, not a permission — both admin roles
 * see every client, and picking one narrows the numbers without entering that
 * client's workspace. It is populated from `GET /companies`, which already
 * returns the full list for an admin, so there is no separate admin endpoint
 * to call.
 */
export function AdminFilterBar({
  filters,
  onChange,
  onReset,
}: {
  filters: SharedFilters;
  onChange: (patch: Partial<SharedFilters>) => void;
  onReset: () => void;
}) {
  const clients = useAsync(() => companiesService.list(), [], { queryKey: queryKeys.companies });
  const employees = useAsync(() => usersService.list(), [], { queryKey: queryKeys.employees });

  const rangeIsCustom = !QUICK_RANGES.some(
    (range) => range.from() === filters.from && range.to() === filters.to,
  );

  return (
    <FilterBar className="admin-filter-bar">
      <div className="admin-filter-bar__fields">
        <Field label="From" htmlFor="admin-from">
          <Input
            id="admin-from"
            type="date"
            value={filters.from ?? ''}
            max={filters.to}
            onChange={(event) => onChange({ from: event.target.value })}
          />
        </Field>
        <Field label="To" htmlFor="admin-to">
          <Input
            id="admin-to"
            type="date"
            value={filters.to ?? ''}
            min={filters.from}
            onChange={(event) => onChange({ to: event.target.value })}
          />
        </Field>
        <Field label="Client" htmlFor="admin-client">
          <Select
            id="admin-client"
            value={filters.clientId ?? ''}
            onChange={(event) => onChange({ clientId: event.target.value || undefined })}
          >
            <option value="">All clients</option>
            {(clients.data ?? []).map((client) => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Employee" htmlFor="admin-employee">
          <Select
            id="admin-employee"
            value={filters.employeeId ?? ''}
            onChange={(event) => onChange({ employeeId: event.target.value || undefined })}
          >
            <option value="">All employees</option>
            {(employees.data ?? []).map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.fullName ?? employee.email}</option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="button-row">
        {QUICK_RANGES.map((range) => {
          const active = !rangeIsCustom && range.from() === filters.from && range.to() === filters.to;
          return (
            <Button
              key={range.label}
              type="button"
              size="sm"
              variant={active ? 'primary' : 'secondary'}
              aria-pressed={active}
              onClick={() => onChange({ from: range.from(), to: range.to() })}
            >
              {range.label}
            </Button>
          );
        })}
        <Button type="button" size="sm" variant="ghost" onClick={onReset}>Reset</Button>
      </div>
    </FilterBar>
  );
}
