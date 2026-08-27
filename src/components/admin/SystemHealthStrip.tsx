import { WidgetBody } from '@/components/admin/WidgetCard';
import { Card } from '@/components/ui/Card';
import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { adminDashboardService } from '@/services/adminDashboard';
import { humanize } from '@/utils/format';
import type { SystemHealth } from '@/types/domain';

type Tone = 'ok' | 'idle' | 'warn' | 'down';

/**
 * State → tone. `UP` is not the only good value: `NOT_IN_USE`, `MOCK` and
 * `NOT_IMPLEMENTED` are expected states today, so treating anything other than
 * `UP` as a failure would paint a healthy platform red every time it loads.
 */
const STATE_TONE: Record<string, Tone> = {
  UP: 'ok',
  DOWN: 'down',
  ERROR: 'down',
  DEGRADED: 'warn',
  MOCK: 'idle',
  NOT_IN_USE: 'idle',
  NOT_IMPLEMENTED: 'idle',
  NOT_CONFIGURED: 'warn',
};

/** Acronyms `humanize` would render as "Api" / "Ai". */
const SERVICE_LABELS: Record<string, string> = { api: 'API', ai: 'AI', db: 'Database' };

function serviceLabel(service: string): string {
  return SERVICE_LABELS[service] ?? humanize(service);
}

/**
 * Super Admin only — an Admin gets 403 here.
 *
 * Open question in the spec: if the Product Owner decides Admin should see
 * platform health too, the only change is dropping the `SuperAdminOnly`
 * wrapper around this component in AdminDashboardPage.
 */
export function SystemHealthStrip() {
  const state = useAsync(() => adminDashboardService.systemHealth(), [], {
    queryKey: queryKeys.adminSystemHealth,
  });

  return (
    <Card className="health-strip">
      <WidgetBody state={state} rows={2}>
        {(health: SystemHealth) => (
          <ul className="health-strip__list">
            {Object.entries(health).map(([service, value]) => (
              <li key={service} className={`health-chip health-chip--${STATE_TONE[value] ?? 'idle'}`}>
                <span className="health-chip__dot" aria-hidden="true" />
                <span className="health-chip__name">{serviceLabel(service)}</span>
                <span className="health-chip__state">{humanize(value)}</span>
              </li>
            ))}
          </ul>
        )}
      </WidgetBody>
    </Card>
  );
}
