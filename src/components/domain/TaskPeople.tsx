import { useId } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Fields';
import { CloseIcon, PlusIcon } from '@/components/ui/icons';
import { useLocale } from '@/context/LocaleContext';
import { MAX_TASK_ASSIGNEES, type Membership, type Task, type TaskAssigneeRole } from '@/types/domain';
import { TASK_ASSIGNEE_ROLES, assigneeName, newPersonRow, sortAssignees, suggestTaskRole, taskRoleLabel, type TaskPersonRow } from '@/utils/taskAssignees';
import { compareNames } from '@/utils/sort';

export interface TaskPersonRowError {
  userId?: string;
  role?: string;
}

function memberName(member: Membership): string {
  return member.user?.fullName ?? member.user?.email ?? member.userId;
}

/**
 * Everybody on a task, each in a role: a person picker and a role picker per
 * row, "+ Add person" and a remove button per row.
 *
 * Picking a person pre-picks the task role matching their company role, if
 * the row has none yet — a member who is a Designer starts as Designer. The
 * user can always change it; Content Creator has no company role behind it.
 */
export function TaskPeopleField({
  value,
  onChange,
  members,
  errors,
  error,
  disabled = false,
}: {
  value: TaskPersonRow[];
  onChange: (next: TaskPersonRow[]) => void;
  members: Membership[];
  /** Per row, by index. */
  errors?: Array<TaskPersonRowError | undefined>;
  /** About the list as a whole (the maximum). */
  error?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const { lang } = useLocale();
  const people = members
    .filter((member) => member.status === 'ACTIVE')
    .sort((left, right) => compareNames(memberName(left), memberName(right)));

  const update = (index: number, patch: Partial<TaskPersonRow>) => {
    onChange(value.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  };

  const choosePerson = (index: number, userId: string) => {
    const row = value[index];
    // Never suggest a role this person already plays on another row.
    const held = new Set(value.filter((other) => other.key !== row.key && other.userId === userId).map((other) => other.role));
    const suggested = row.role || suggestTaskRole(people.find((member) => member.userId === userId), held) || '';
    update(index, { userId, role: suggested });
  };

  const taken = (row: TaskPersonRow, role: TaskAssigneeRole) =>
    Boolean(row.userId) && value.some((other) => other.key !== row.key && other.userId === row.userId && other.role === role);

  return (
    <div className="field">
      <fieldset className="task-people" disabled={disabled} aria-describedby={`${id}-hint`}>
        <legend className="field__label">People on this task</legend>
        {value.length ? (
          <ol className="task-people__rows">
            {value.map((row, index) => {
              const rowError = errors?.[index];
              const person = people.find((member) => member.userId === row.userId);
              return (
                <li key={row.key} className="task-people__row">
                  <div className="task-people__controls">
                    <Select
                      aria-label={`Person ${index + 1}`}
                      aria-invalid={rowError?.userId ? true : undefined}
                      value={row.userId}
                      onChange={(event) => choosePerson(index, event.target.value)}
                    >
                      <option value="">Choose a person…</option>
                      {/* Somebody saved on the task who is no longer listed still shows by id, so the row is not silently blanked. */}
                      {row.userId && !person ? <option value={row.userId}>{row.userId}</option> : null}
                      {people.map((member) => <option key={member.id} value={member.userId}>{memberName(member)}</option>)}
                    </Select>
                    <Select
                      aria-label={`Role of person ${index + 1}`}
                      aria-invalid={rowError?.role ? true : undefined}
                      value={row.role}
                      onChange={(event) => update(index, { role: event.target.value as TaskAssigneeRole | '' })}
                    >
                      <option value="">Choose a role…</option>
                      {TASK_ASSIGNEE_ROLES.map((role) => (
                        <option key={role} value={role} disabled={taken(row, role)}>{taskRoleLabel(role, lang)}</option>
                      ))}
                    </Select>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="task-people__remove"
                      aria-label={`Remove ${person ? memberName(person) : `person ${index + 1}`}`}
                      onClick={() => onChange(value.filter((other) => other.key !== row.key))}
                    >
                      <CloseIcon size={16} />
                    </Button>
                  </div>
                  {index === 0 && row.userId ? <p className="field__hint">Leads the task unless you pick a lead below.</p> : null}
                  {rowError?.userId ? <p className="field__error" role="alert">{rowError.userId}</p> : null}
                  {rowError?.role ? <p className="field__error" role="alert">{rowError.role}</p> : null}
                </li>
              );
            })}
          </ol>
        ) : null}
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onChange([...value, newPersonRow()])}
            disabled={value.length >= MAX_TASK_ASSIGNEES}
          >
            <PlusIcon size={14} /> Add person
          </Button>
        </div>
      </fieldset>
      <p className="field__hint" id={`${id}-hint`}>
        {value.length >= MAX_TASK_ASSIGNEES
          ? `Up to ${MAX_TASK_ASSIGNEES} people per task.`
          : 'Optional. Each person is told in their role. Put the person doing the main work first.'}
      </p>
      {error ? <p className="field__error" role="alert">{error}</p> : null}
    </div>
  );
}

/**
 * Who is on a task, lead first. A task from before task people has no list,
 * only a lead — shown as the lead with no role.
 */
export function TaskPeopleList({
  task,
  resolveName,
}: {
  task: Pick<Task, 'assignees' | 'assignedToId' | 'assignedTo'>;
  resolveName: (id?: string | null) => string;
}) {
  const { lang } = useLocale();
  const rows = sortAssignees(task.assignees ?? [], task.assignedToId);
  const leadListed = rows.some((row) => row.userId === task.assignedToId);

  if (!rows.length && !task.assignedToId) return <p className="muted">Nobody is on this task yet.</p>;

  return (
    <ul className="task-people-list">
      {task.assignedToId && !leadListed ? (
        <li className="task-people-list__item">
          <strong>{task.assignedTo?.fullName || task.assignedTo?.email || resolveName(task.assignedToId)}</strong>
          <Badge tone="info">Lead</Badge>
        </li>
      ) : null}
      {rows.map((row, index) => (
        <li key={row.id} className="task-people-list__item">
          <strong>{row.user ? assigneeName(row) : resolveName(row.userId)}</strong>
          <span className="muted">{taskRoleLabel(row.role, lang)}</span>
          {/* The lead sorts first; somebody in two roles is marked once. */}
          {index === 0 && row.userId === task.assignedToId ? <Badge tone="info">Lead</Badge> : null}
          {row.user?.status && row.user.status !== 'ACTIVE' ? <Badge tone="danger">Deactivated</Badge> : null}
        </li>
      ))}
    </ul>
  );
}
