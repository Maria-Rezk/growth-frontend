import { Link } from 'react-router-dom';
import { ButtonLink } from '@/components/ui/Button';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { formatDate, formatDateTime } from '@/utils/format';
import { isOverdue } from '@/utils/workflow';
import type { ContentPost, Lead, Task } from '@/types/domain';

export function ActionCenter({ posts, leads, tasks }: { posts: ContentPost[]; leads: Lead[]; tasks: Task[] }) {
  const queue = [
    ...posts.map((post) => ({
      id: `post-${post.id}`,
      title: post.title,
      subtitle: `${post.platform ?? 'Content'} · ${post.contentType ?? 'Post'}`,
      status: post.status,
      to: `/posts/${post.id}`,
      meta: formatDateTime(post.scheduledAt),
      priority: post.status === 'CHANGES_REQUESTED' ? 1 : post.status === 'READY_FOR_CLIENT' ? 2 : 4,
    })),
    ...tasks.map((task) => ({
      id: `task-${task.id}`,
      title: task.title,
      subtitle: task.assignedTo?.fullName ?? 'Unassigned task',
      status: task.priority,
      to: `/tasks/${task.id}`,
      meta: `${isOverdue(task.dueDate) ? 'Overdue' : 'Due'} ${formatDate(task.dueDate)}`,
      priority: task.priority === 'URGENT' || isOverdue(task.dueDate) ? 1 : task.priority === 'HIGH' ? 2 : 3,
    })),
    ...leads.map((lead) => ({
      id: `lead-${lead.id}`,
      title: lead.name,
      subtitle: lead.source ?? lead.email ?? lead.phone ?? 'No source',
      status: lead.status,
      to: `/leads/${lead.id}`,
      meta: formatDateTime(lead.updatedAt ?? lead.createdAt),
      priority: lead.status === 'NEW' || lead.status === 'INTERESTED' ? 2 : 4,
    })),
  ]
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 8);

  return (
    <div className="action-center">
      {queue.map((item) => (
        <Link key={item.id} to={item.to} className="action-item">
          <div>
            <strong>{item.title}</strong>
            <p>{item.subtitle}</p>
          </div>
          <div className="action-item__meta">
            <StatusBadge value={item.status} />
            <span>{item.meta}</span>
          </div>
        </Link>
      ))}
      {queue.length === 0 ? <p className="muted">No urgent operational items right now.</p> : null}
      <div className="action-center__footer">
        <ButtonLink to="/tasks" variant="secondary" size="sm">Open task board</ButtonLink>
        <ButtonLink to="/posts" variant="ghost" size="sm">Open content</ButtonLink>
      </div>
    </div>
  );
}
