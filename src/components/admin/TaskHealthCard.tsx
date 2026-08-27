import { WidgetCard } from '@/components/admin/WidgetCard';
import { Stat, StatBars, StatStrip } from '@/components/admin/WidgetPrimitives';
import { Button } from '@/components/ui/Button';
import { useAsync } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { adminDashboardService } from '@/services/adminDashboard';
import { TaskStatus, type DashboardFilters, type TaskHealth } from '@/types/domain';

const STATUS_ORDER = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW, TaskStatus.BLOCKED] as const;

/**
 * Task health.
 *
 * The numbers deliberately do not link to a cross-client task list: no such
 * screen exists, and `/tasks` is client-scoped and ignores query filters, so a
 * link would look like a drill-down and quietly do nothing. The real
 * drill-down for overdue/blocked work is the attention feed, which lists the
 * same items with a route into each — so that is what the action offers.
 */
export function TaskHealthCard({
  filters,
  onShowAttention,
}: {
  filters: DashboardFilters;
  onShowAttention: () => void;
}) {
  const state = useAsync(() => adminDashboardService.tasks(filters), [filters], {
    queryKey: queryKeys.adminWidget('tasks', filters),
  });

  return (
    <WidgetCard
      title="Task health"
      subtitle="Open work across every client."
      action={<Button variant="secondary" size="sm" onClick={onShowAttention}>Open the queue</Button>}
      state={state}
      rows={6}
    >
      {(data: TaskHealth) => (
        <>
          <p className="widget-headline"><strong>{data.openTotal}</strong> <span>open tasks</span></p>
          <StatBars counts={data.byStatus} order={STATUS_ORDER} highlight={[TaskStatus.BLOCKED]} />
          <StatStrip>
            <Stat label="Due today" value={data.dueToday} tone="info" />
            <Stat label="Overdue" value={data.overdue} tone="warning" />
            <Stat label="Urgent" value={data.urgent} tone="warning" />
            <Stat label="High priority" value={data.highPriority} />
            <Stat label="Unassigned" value={data.unassigned} tone="warning" />
            <Stat label="Completed today" value={data.completedToday} tone="success" />
          </StatStrip>
        </>
      )}
    </WidgetCard>
  );
}
