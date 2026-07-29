import { FormEvent, useState } from 'react';
import { useParams } from 'react-router-dom';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { PageHeader, Card, CardHeader } from '@/components/ui/Card';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Select, Textarea, Input } from '@/components/ui/Fields';
import { LoadingState, ErrorState } from '@/components/ui/State';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { Timeline } from '@/components/domain/Timeline';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { tasksService } from '@/services/tasks';
import { companiesService } from '@/services/companies';
import { filesService } from '@/services/files';
import { queryKeys } from '@/lib/queryClient';
import { formatDateTime, humanize } from '@/utils/format';
import { TaskStatus } from '@/types/domain';

export function TaskDetailPage() {
  const { taskId = '' } = useParams();
  return <RequireCompany>{(companyId) => <TaskDetailInner companyId={companyId} taskId={taskId} />}</RequireCompany>;
}

function TaskDetailInner({ companyId, taskId }: { companyId: string; taskId: string }) {
  const task = useAsync(() => tasksService.get(companyId, taskId), [companyId, taskId], { queryKey: queryKeys.task(companyId, taskId) });
  const comments = useAsync(() => tasksService.comments(companyId, taskId), [companyId, taskId]);
  const logs = useAsync(() => tasksService.activityLogs(companyId, taskId), [companyId, taskId]);
  const attachments = useAsync(() => tasksService.attachments(companyId, taskId), [companyId, taskId]);
  const members = useAsync(() => companiesService.members(companyId), [companyId], { queryKey: queryKeys.companyMembers(companyId) });

  const setStatus = useMutation(tasksService.setStatus, { invalidateKeys: [['companies', companyId, 'tasks'], queryKeys.task(companyId, taskId)] });
  const update = useMutation(tasksService.update, { invalidateKeys: [['companies', companyId, 'tasks'], queryKeys.task(companyId, taskId)] });
  const upload = useMutation(filesService.upload);
  const attach = useMutation(tasksService.attachFile);

  const [comment, setComment] = useState('');

  if (task.loading) return <LoadingState />;
  if (task.error || !task.data) return <ErrorState message={task.error ?? 'Task not found.'} onRetry={task.refetch} />;

  const resolveName = (id?: string | null) => {
    if (!id) return 'Unassigned';
    const m = (members.data ?? []).find((x) => x.userId === id);
    return m ? (m.user?.fullName ?? m.user?.email ?? m.userId) : 'Assigned';
  };

  const changeStatus = async (status: TaskStatus) => {
    const result = await setStatus.mutate(companyId, taskId, status);
    if (result) { task.setData(result); await logs.refetch(); }
  };
  const changeAssignee = async (assignedToId: string) => {
    const result = await update.mutate(companyId, taskId, { assignedToId: assignedToId || undefined });
    if (result) { task.setData(result); await logs.refetch(); }
  };
  const addComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!comment.trim()) return;
    await tasksService.addComment(companyId, taskId, comment.trim());
    setComment(''); await comments.refetch();
  };
  const onFile = async (file?: File) => {
    if (!file) return;
    const stored = await upload.mutate(companyId, file);
    if (stored) { await attach.mutate(companyId, taskId, stored.id); await attachments.refetch(); }
  };

  return (
    <>
      <PageHeader title={task.data.title} subtitle="Task detail, collaboration and activity log." action={<ButtonLink to="/tasks" variant="secondary" size="sm">Back to tasks</ButtonLink>} />
      <div className="detail-grid">
        <section className="detail-main">
          <Card className="content-card"><CardHeader title="Task" action={<StatusBadge value={task.data.status} />} /><div className="content-card__body"><p className="pre-wrap">{task.data.description || 'No description.'}</p><div className="key-values"><div><span>Priority</span><strong><StatusBadge value={task.data.priority} /></strong></div><div><span>Type</span><strong>{humanize(task.data.type)}</strong></div><div><span>Assigned</span><strong>{resolveName(task.data.assignedToId)}</strong></div><div><span>Due</span><strong>{formatDateTime(task.data.dueDate)}</strong></div></div></div></Card>
          <Card className="content-card"><CardHeader title="Comments" /><div className="content-card__body stack-list">{comments.data?.map((item) => <div className="comment" key={item.id}><strong>{item.author?.fullName ?? 'Team member'}</strong><p>{item.body}</p><time>{formatDateTime(item.createdAt)}</time></div>)}<form className="inline-form" onSubmit={addComment}><Textarea aria-label="Comment" rows={3} value={comment} onChange={(event) => setComment(event.target.value)} /><Button type="submit">Send</Button></form></div></Card>
        </section>
        <aside className="detail-side">
          <Card className="content-card"><CardHeader title="Status" /><div className="content-card__body"><Field label="Status" htmlFor="task-status"><Select id="task-status" value={task.data.status} onChange={(event) => changeStatus(event.target.value as TaskStatus)}>{Object.values(TaskStatus).map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</Select></Field></div></Card>
          <Card className="content-card"><CardHeader title="Assignment" /><div className="content-card__body"><Field label="Assigned to" htmlFor="task-assignee"><Select id="task-assignee" value={task.data.assignedToId ?? ''} onChange={(event) => changeAssignee(event.target.value)}><option value="">Unassigned</option>{(members.data ?? []).map((member) => <option key={member.id} value={member.userId}>{member.user?.fullName ?? member.user?.email ?? member.userId} · {humanize(member.role)}</option>)}</Select></Field>{update.error ? <p className="error-box" role="alert">{update.error}</p> : null}</div></Card>
          <Card className="content-card"><CardHeader title="Attachments" /><div className="content-card__body stack-list"><Input type="file" aria-label="Upload attachment" onChange={(event) => onFile(event.target.files?.[0])} />{attachments.data?.map((item) => <div className="list-row" key={item.id}>{item.file?.originalName ?? item.file?.filename ?? item.fileId}</div>)}{attachments.data?.length === 0 ? <p className="muted">No attachments.</p> : null}</div></Card>
          <Card className="content-card"><CardHeader title="Activity" /><div className="content-card__body"><Timeline items={(logs.data ?? []).map((item) => ({ id: item.id, title: item.action, createdAt: item.createdAt }))} /></div></Card>
        </aside>
      </div>
    </>
  );
}