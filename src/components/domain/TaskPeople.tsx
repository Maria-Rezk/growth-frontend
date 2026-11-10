import { useId, useRef } from 'react';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { OptionalMark, Select } from '@/components/ui/Fields';
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, LockIcon, PlusIcon } from '@/components/ui/icons';
import { useLocale } from '@/context/LocaleContext';
import { MAX_TASK_ASSIGNEES, TaskStepStatus, type Membership, type Task, type TaskAssignee, type TaskAssigneeRole } from '@/types/domain';
import { formatDateTime } from '@/utils/format';
import { TASK_ASSIGNEE_ROLES, assigneeName, newPersonRow, suggestTaskRole, taskRoleLabel, type TaskPersonRow } from '@/utils/taskAssignees';
import { formatDuration, isStepEligible, lockedCount, moveRow, sortSteps, stepDurationMs } from '@/utils/taskSteps';
import { compareNames } from '@/utils/sort';

export interface TaskPersonRowError {
  userId?: string;
  role?: string;
  approverId?: string;
}

function memberName(member: Membership): string {
  return member.user?.fullName ?? member.user?.email ?? member.userId;
}

const STEP_STATUS: Record<TaskStepStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'Not reached', tone: 'neutral' },
  TODO: { label: 'Their turn', tone: 'info' },
  IN_PROGRESS: { label: 'Working', tone: 'accent' },
  IN_REVIEW: { label: 'In review', tone: 'warning' },
  DONE: { label: 'Done', tone: 'success' },
};

export function StepStatusBadge({ status }: { status?: TaskStepStatus }) {
  if (!status) return null;
  const meta = STEP_STATUS[status] ?? { label: status, tone: 'neutral' as BadgeTone };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

/**
 * The people on a task, as an ordered flow of steps (release guide 3.5).
 *
 * Each row is one step: a person, the role they play, and optionally the
 * approver who signs that step off. The order of the rows is the order of the
 * flow — the next person is told only when the previous step is done — so
 * rows can be moved up and down.
 *
 * Steps that have started are history: shown first, locked, never moved or
 * removed (the API answers 409 STEP_FLOW_STARTED otherwise).
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
  /** About the list as a whole (the maximum, or a locked-step conflict). */
  error?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const listRef = useRef<HTMLOListElement>(null);

  /*
    Moving a row keeps focus on the button that was pressed — React moves the
    row's elements with it. At the top or bottom that button turns disabled
    and the browser drops focus to the page, so hand it to the row's other
    move button instead.
  */
  const move = (index: number, direction: -1 | 1) => {
    const key = value[index]?.key;
    onChange(moveRow(value, index, direction));
    window.setTimeout(() => {
      const row = listRef.current?.querySelector<HTMLElement>(`[data-row="${key}"]`);
      const pressed = row?.querySelector<HTMLButtonElement>(`[data-move="${direction}"]`);
      if (pressed?.disabled) row?.querySelector<HTMLButtonElement>(`[data-move="${-direction}"]`)?.focus();
    }, 0);
  };
  const { lang } = useLocale();
  // Internal staff only: a step is never given to, or approved by, a client contact.
  const people = members
    .filter(isStepEligible)
    .sort((left, right) => compareNames(memberName(left), memberName(right)));
  const nameOf = (userId?: string) => {
    if (!userId) return '';
    const member = people.find((item) => item.userId === userId);
    return member ? memberName(member) : userId;
  };
  const locked = lockedCount(value);

  const update = (index: number, patch: Partial<TaskPersonRow>) => {
    onChange(value.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  };

  const choosePerson = (index: number, userId: string) => {
    const row = value[index];
    // Never suggest a role this person already plays on another row.
    const held = new Set(value.filter((other) => other.key !== row.key && other.userId === userId).map((other) => other.role));
    const suggested = row.role || suggestTaskRole(people.find((member) => member.userId === userId), held) || '';
    // Nobody approves their own step.
    update(index, { userId, role: suggested, approverId: row.approverId === userId ? '' : row.approverId });
  };

  const taken = (row: TaskPersonRow, role: TaskAssigneeRole) =>
    Boolean(row.userId) && value.some((other) => other.key !== row.key && other.userId === row.userId && other.role === role);

  return (
    <div className="field">
      <fieldset className="task-people" disabled={disabled} aria-describedby={`${id}-hint`}>
        <legend className="field__label">Steps<OptionalMark /></legend>
        {value.length ? (
          <ol className="task-steps-editor" ref={listRef}>
            {value.map((row, index) => {
              const rowError = errors?.[index];
              const label = nameOf(row.userId) || `step ${index + 1}`;
              if (row.locked) {
                return (
                  <li key={row.key} className="task-step-row task-step-row--locked">
                    <span className="task-step-row__number" aria-hidden="true">{index + 1}</span>
                    <div className="task-step-row__body">
                      <p className="task-step-row__summary">
                        <strong>{nameOf(row.userId)}</strong>
                        <span className="muted"> · {row.role ? taskRoleLabel(row.role, lang) : ''}</span>
                        {row.approverId ? <span className="muted"> · approved by {nameOf(row.approverId)}</span> : null}
                      </p>
                      <p className="task-step-row__lock">
                        <StepStatusBadge status={row.stepStatus} />
                        <span className="muted"><LockIcon size={12} /> Started — kept as it is</span>
                      </p>
                    </div>
                  </li>
                );
              }
              return (
                <li key={row.key} className="task-step-row" data-row={row.key}>
                  <span className="task-step-row__number" aria-hidden="true">{index + 1}</span>
                  <div className="task-step-row__body">
                    <div className="task-step-row__controls">
                      <Select
                        aria-label={`Person for step ${index + 1}`}
                        aria-invalid={rowError?.userId ? true : undefined}
                        value={row.userId}
                        onChange={(event) => choosePerson(index, event.target.value)}
                      >
                        <option value="">Choose a person…</option>
                        {/* Somebody saved on the task who is no longer listed still shows by id, so the row is not silently blanked. */}
                        {row.userId && !people.some((member) => member.userId === row.userId) ? <option value={row.userId}>{row.userId}</option> : null}
                        {people.map((member) => <option key={member.id} value={member.userId}>{memberName(member)}</option>)}
                      </Select>
                      <Select
                        aria-label={`Role for step ${index + 1}`}
                        aria-invalid={rowError?.role ? true : undefined}
                        value={row.role}
                        onChange={(event) => update(index, { role: event.target.value as TaskAssigneeRole | '' })}
                      >
                        <option value="">Choose a role…</option>
                        {TASK_ASSIGNEE_ROLES.map((role) => (
                          <option key={role} value={role} disabled={taken(row, role)}>{taskRoleLabel(role, lang)}</option>
                        ))}
                      </Select>
                      <Select
                        className="task-step-row__approver"
                        aria-label={`Approver for step ${index + 1}`}
                        aria-invalid={rowError?.approverId ? true : undefined}
                        value={row.approverId ?? ''}
                        onChange={(event) => update(index, { approverId: event.target.value })}
                      >
                        <option value="">No approver — done on submit</option>
                        {row.approverId && !people.some((member) => member.userId === row.approverId) ? <option value={row.approverId}>{row.approverId}</option> : null}
                        {people.filter((member) => member.userId !== row.userId).map((member) => (
                          <option key={member.id} value={member.userId}>Approved by {memberName(member)}</option>
                        ))}
                      </Select>
                      <div className="task-step-row__tools">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Move ${label} up`}
                          disabled={index <= locked}
                          data-move="-1"
                          onClick={() => move(index, -1)}
                        >
                          <ChevronUpIcon size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Move ${label} down`}
                          disabled={index >= value.length - 1}
                          data-move="1"
                          onClick={() => move(index, 1)}
                        >
                          <ChevronDownIcon size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove ${label}`}
                          onClick={() => onChange(value.filter((other) => other.key !== row.key))}
                        >
                          <CloseIcon size={16} />
                        </Button>
                      </div>
                    </div>
                    {rowError?.userId ? <p className="field__error" role="alert">{rowError.userId}</p> : null}
                    {rowError?.role ? <p className="field__error" role="alert">{rowError.role}</p> : null}
                    {rowError?.approverId ? <p className="field__error" role="alert">{rowError.approverId}</p> : null}
                  </div>
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
            <PlusIcon size={14} /> {value.length ? 'Add step' : 'Add steps'}
          </Button>
        </div>
      </fieldset>
      <p className="field__hint" id={`${id}-hint`}>
        {value.length >= MAX_TASK_ASSIGNEES
          ? `Up to ${MAX_TASK_ASSIGNEES} steps per task.`
          : value.length
            ? 'Steps run top to bottom. Each person is told when the step before theirs is done; a step with an approver waits for their sign-off.'
            : 'Leave empty for one assignee and one approver. Add steps when the work passes between people.'}
      </p>
      {error ? <p className="field__error" role="alert">{error}</p> : null}
    </div>
  );
}

/**
 * The flow on the task page: every step in order, with whose turn it is, who
 * approves it, and how long each person took. A task without steps shows its
 * single assignee.
 */
export function TaskStepTimeline({
  task,
  resolveName,
}: {
  task: Pick<Task, 'assignees' | 'assignedToId' | 'assignedTo'>;
  resolveName: (id?: string | null) => string;
}) {
  const { lang } = useLocale();
  const steps = sortSteps(task.assignees ?? []);

  if (!steps.length) {
    if (!task.assignedToId) return <p className="muted">Nobody is assigned yet.</p>;
    return (
      <ul className="task-people-list">
        <li className="task-people-list__item">
          <strong>{task.assignedTo?.fullName || task.assignedTo?.email || resolveName(task.assignedToId)}</strong>
          <Badge tone="info">Assignee</Badge>
        </li>
      </ul>
    );
  }

  const nameOf = (step: TaskAssignee) => (step.user ? assigneeName(step) : resolveName(step.userId));
  const approverOf = (step: TaskAssignee) => step.approver?.fullName || step.approver?.email || resolveName(step.approverId);

  return (
    <ol className="step-timeline" aria-label="Steps">
      {steps.map((step, index) => {
        const live = step.status === 'TODO' || step.status === 'IN_PROGRESS' || step.status === 'IN_REVIEW';
        const duration = stepDurationMs(step);
        return (
          <li
            key={step.id}
            className={`step-timeline__item step-timeline__item--${(step.status ?? 'PENDING').toLowerCase()}`}
            aria-current={live ? 'step' : undefined}
          >
            <span className="step-timeline__marker" aria-hidden="true">{step.status === 'DONE' ? '✓' : index + 1}</span>
            <div className="step-timeline__body">
              <p className="step-timeline__head">
                <span className="sr-only">Step {index + 1} of {steps.length}: </span>
                <strong>{nameOf(step)}</strong>
                <span className="muted">{taskRoleLabel(step.role, lang)}</span>
                <StepStatusBadge status={step.status} />
                {step.user?.status && step.user.status !== 'ACTIVE' ? <Badge tone="danger">Deactivated</Badge> : null}
              </p>
              <p className="step-timeline__meta muted">
                {step.approverId ? <>Approved by {approverOf(step)}</> : <>No approver — done on submit</>}
                {step.status === 'DONE' && duration !== null ? <> · took {formatDuration(duration)}</> : null}
                {step.status === 'IN_PROGRESS' && step.startedAt ? <> · started {formatDateTime(step.startedAt)}</> : null}
                {step.status === 'IN_REVIEW' && step.submittedAt ? <> · submitted {formatDateTime(step.submittedAt)}</> : null}
                {step.status === 'TODO' && step.reachedAt ? <> · their turn since {formatDateTime(step.reachedAt)}</> : null}
              </p>
              {live && step.reviewNote && step.status === 'IN_PROGRESS' ? (
                <p className="step-timeline__note">Changes requested: {step.reviewNote}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
