import { useId, useRef } from 'react';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { OptionalMark, Select } from '@/components/ui/Fields';
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, LockIcon, PlusIcon } from '@/components/ui/icons';
import { useLocale } from '@/context/LocaleContext';
import { MAX_TASK_ASSIGNEES, type Membership, type Task, type TaskAssignee, type TaskAssigneeRole, type TaskStep, type TaskStepStatus } from '@/types/domain';
import { formatDateTime } from '@/utils/format';
import { TASK_ASSIGNEE_ROLES, assigneeName, suggestTaskRole, taskRoleLabel } from '@/utils/taskAssignees';
import {
  anchoredCount,
  flowSteps,
  formatDuration,
  isStepEligible,
  moveStep,
  newFormPerson,
  newFormStep,
  peopleCount,
  spanMs,
  stepDurationMs,
  stepEditRules,
  type FormPerson,
  type FormStep,
} from '@/utils/taskSteps';
import { compareNames } from '@/utils/sort';

/* ---------- Status badges ---------- */

const PERSON_STATUS: Record<TaskStepStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'Not reached', tone: 'neutral' },
  TODO: { label: 'Their turn', tone: 'info' },
  IN_PROGRESS: { label: 'Working', tone: 'accent' },
  SUBMITTED: { label: 'Submitted · waiting for others', tone: 'success' },
  IN_REVIEW: { label: 'In review', tone: 'warning' },
  DONE: { label: 'Done', tone: 'success' },
};

const STEP_STATUS: Record<TaskStepStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'Not reached', tone: 'neutral' },
  TODO: { label: 'Not started', tone: 'info' },
  IN_PROGRESS: { label: 'In progress', tone: 'accent' },
  SUBMITTED: { label: 'In progress', tone: 'accent' },
  IN_REVIEW: { label: 'With the approver', tone: 'warning' },
  DONE: { label: 'Done', tone: 'success' },
};

/** One person's own status. */
export function StepStatusBadge({ status }: { status?: TaskStepStatus }) {
  if (!status) return null;
  const meta = PERSON_STATUS[status] ?? { label: status, tone: 'neutral' as BadgeTone };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

/** A whole step's status. */
function StepBadge({ status }: { status?: TaskStepStatus }) {
  if (!status) return null;
  const meta = STEP_STATUS[status] ?? { label: status, tone: 'neutral' as BadgeTone };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

/* ---------- The form ---------- */

export interface TaskStepFieldErrors {
  approverId?: string;
  people?: Array<{ userId?: string; role?: string } | undefined>;
}

function memberName(member: Membership): string {
  return member.user?.fullName ?? member.user?.email ?? member.userId;
}

/**
 * The flow as the form edits it (parallel-steps guide 1.2, 1.9): steps run
 * top to bottom; the people inside a step work side by side; each step has
 * one approver, or none. "Add person to this step" puts somebody beside the
 * others; "Add next step" puts the next hand-off below.
 *
 * Saved steps keep the editing rules (1.3): a finished step is history, a
 * step with its approver keeps its people, and anybody who started stays.
 */
export function TaskPeopleField({
  value,
  onChange,
  members,
  errors,
  error,
  disabled = false,
}: {
  value: FormStep[];
  onChange: (next: FormStep[]) => void;
  members: Membership[];
  errors?: Array<TaskStepFieldErrors | undefined>;
  /** About the flow as a whole (the maximum, or a refused edit). */
  error?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const { lang } = useLocale();
  const listRef = useRef<HTMLOListElement>(null);
  // Internal staff only: a step is never given to, or approved by, a client contact.
  const people = members.filter(isStepEligible).sort((left, right) => compareNames(memberName(left), memberName(right)));
  const nameOf = (userId?: string) => {
    if (!userId) return '';
    const member = people.find((item) => item.userId === userId) ?? members.find((item) => item.userId === userId);
    return member ? memberName(member) : userId;
  };
  const total = peopleCount(value);
  const full = total >= MAX_TASK_ASSIGNEES;
  const floor = anchoredCount(value);

  const setStep = (index: number, patch: Partial<FormStep>) => onChange(value.map((step, at) => (at === index ? { ...step, ...patch } : step)));
  const setPerson = (stepIndex: number, personIndex: number, patch: Partial<FormPerson>) =>
    setStep(stepIndex, { people: value[stepIndex].people.map((person, at) => (at === personIndex ? { ...person, ...patch } : person)) });

  const choosePerson = (stepIndex: number, personIndex: number, userId: string) => {
    const step = value[stepIndex];
    const row = step.people[personIndex];
    // Never suggest a role this person already plays elsewhere on the task.
    const held = new Set(value.flatMap((other) => other.people).filter((other) => other.key !== row.key && other.userId === userId).map((other) => other.role));
    const role = row.role || suggestTaskRole(people.find((member) => member.userId === userId), held) || '';
    // Nobody approves a step they work on.
    onChange(value.map((other, at) => (at !== stepIndex ? other : {
      ...other,
      approverId: other.approverId === userId ? '' : other.approverId,
      people: other.people.map((person, index) => (index === personIndex ? { ...person, userId, role } : person)),
    })));
  };

  /*
    Moving a step keeps focus on the pressed button — React moves the step's
    elements with it. At the top or bottom that button turns disabled and the
    browser drops focus, so hand it to the step's other move button.
  */
  const move = (index: number, direction: -1 | 1) => {
    const key = value[index]?.key;
    onChange(moveStep(value, index, direction));
    window.setTimeout(() => {
      const block = listRef.current?.querySelector<HTMLElement>(`[data-step="${key}"]`);
      const pressed = block?.querySelector<HTMLButtonElement>(`[data-move="${direction}"]`);
      if (pressed?.disabled) block?.querySelector<HTMLButtonElement>(`[data-move="${-direction}"]`)?.focus();
    }, 0);
  };

  const roleTaken = (person: FormPerson, role: TaskAssigneeRole) =>
    Boolean(person.userId) && value.some((step) => step.people.some((other) => other.key !== person.key && other.userId === person.userId && other.role === role));

  return (
    <div className="field">
      <fieldset className="task-people" disabled={disabled} aria-describedby={`${id}-hint`}>
        <legend className="field__label">Steps<OptionalMark /></legend>
        {value.length ? (
          <ol className="task-steps-editor" ref={listRef}>
            {value.map((step, stepIndex) => {
              const rules = stepEditRules(step);
              const stepErrors = errors?.[stepIndex];
              const stepLabel = `step ${stepIndex + 1}`;
              const onStep = new Set(step.people.map((person) => person.userId).filter(Boolean));
              return (
                <li key={step.key} className="task-step-block" data-step={step.key} aria-label={`Step ${stepIndex + 1}`}>
                  <div className="task-step-block__head">
                    <span className="task-step-row__number" aria-hidden="true">{stepIndex + 1}</span>
                    <strong>Step {stepIndex + 1}</strong>
                    {step.status ? <StepBadge status={step.status} /> : null}
                    {step.people.length > 1 ? <span className="muted">{step.people.length} people side by side</span> : null}
                    <span className="task-step-row__tools">
                      <Button variant="ghost" size="sm" aria-label={`Move ${stepLabel} up`} data-move="-1" disabled={rules.anchored || stepIndex <= floor} onClick={() => move(stepIndex, -1)}>
                        <ChevronUpIcon size={16} />
                      </Button>
                      <Button variant="ghost" size="sm" aria-label={`Move ${stepLabel} down`} data-move="1" disabled={rules.anchored || stepIndex >= value.length - 1} onClick={() => move(stepIndex, 1)}>
                        <ChevronDownIcon size={16} />
                      </Button>
                      {rules.canRemoveStep ? (
                        <Button variant="ghost" size="sm" aria-label={`Remove ${stepLabel}`} onClick={() => onChange(value.filter((other) => other.key !== step.key))}>
                          <CloseIcon size={16} />
                        </Button>
                      ) : null}
                    </span>
                  </div>

                  <ul className="task-step-block__people">
                    {step.people.map((person, personIndex) => {
                      const personErrors = stepErrors?.people?.[personIndex];
                      const label = nameOf(person.userId) || `person ${personIndex + 1} on ${stepLabel}`;
                      if (person.locked) {
                        return (
                          <li key={person.key} className="task-step-person task-step-person--locked">
                            <p className="task-step-row__summary">
                              <strong>{nameOf(person.userId)}</strong>
                              <span className="muted"> · {person.role ? taskRoleLabel(person.role, lang) : ''}</span>
                            </p>
                            <p className="task-step-row__lock">
                              <StepStatusBadge status={person.status} />
                              <span className="muted"><LockIcon size={12} /> Started — kept as it is</span>
                            </p>
                          </li>
                        );
                      }
                      return (
                        <li key={person.key} className="task-step-person">
                          <div className="task-step-person__controls">
                            <Select
                              aria-label={`Person ${personIndex + 1} on ${stepLabel}`}
                              aria-invalid={personErrors?.userId ? true : undefined}
                              value={person.userId}
                              onChange={(event) => choosePerson(stepIndex, personIndex, event.target.value)}
                            >
                              <option value="">Choose a person…</option>
                              {person.userId && !people.some((member) => member.userId === person.userId) ? <option value={person.userId}>{nameOf(person.userId)}</option> : null}
                              {people.map((member) => (
                                <option key={member.id} value={member.userId} disabled={member.userId !== person.userId && onStep.has(member.userId)}>
                                  {memberName(member)}
                                </option>
                              ))}
                            </Select>
                            <Select
                              aria-label={`Role of person ${personIndex + 1} on ${stepLabel}`}
                              aria-invalid={personErrors?.role ? true : undefined}
                              value={person.role}
                              onChange={(event) => setPerson(stepIndex, personIndex, { role: event.target.value as TaskAssigneeRole | '' })}
                            >
                              <option value="">Choose a role…</option>
                              {TASK_ASSIGNEE_ROLES.map((role) => (
                                <option key={role} value={role} disabled={roleTaken(person, role)}>{taskRoleLabel(role, lang)}</option>
                              ))}
                            </Select>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="task-step-person__remove"
                              aria-label={`Remove ${label} from ${stepLabel}`}
                              disabled={step.people.length === 1 && !rules.canRemoveStep}
                              onClick={() => {
                                const remaining = step.people.filter((other) => other.key !== person.key);
                                // The last person out takes the step with them.
                                onChange(remaining.length ? value.map((other, at) => (at === stepIndex ? { ...other, people: remaining } : other)) : value.filter((other) => other.key !== step.key));
                              }}
                            >
                              <CloseIcon size={16} />
                            </Button>
                          </div>
                          {personErrors?.userId ? <p className="field__error" role="alert">{personErrors.userId}</p> : null}
                          {personErrors?.role ? <p className="field__error" role="alert">{personErrors.role}</p> : null}
                        </li>
                      );
                    })}
                  </ul>

                  <div className="task-step-block__foot">
                    {rules.canAddPeople ? (
                      <Button variant="ghost" size="sm" disabled={full} onClick={() => setStep(stepIndex, { people: [...step.people, newFormPerson()] })}>
                        <PlusIcon size={14} /> Add person to this step
                      </Button>
                    ) : null}
                    <Select
                      className="task-step-block__approver"
                      aria-label={`Approver for ${stepLabel}`}
                      aria-invalid={stepErrors?.approverId ? true : undefined}
                      value={step.approverId}
                      disabled={!rules.canChangeApprover}
                      onChange={(event) => setStep(stepIndex, { approverId: event.target.value })}
                    >
                      <option value="" disabled={!rules.canClearApprover}>
                        {step.people.length > 1 ? 'No approver — done when everybody submits' : 'No approver — done on submit'}
                      </option>
                      {step.approverId && !people.some((member) => member.userId === step.approverId) ? <option value={step.approverId}>Approved by {nameOf(step.approverId)}</option> : null}
                      {people.filter((member) => !onStep.has(member.userId)).map((member) => (
                        <option key={member.id} value={member.userId}>Approved by {memberName(member)}</option>
                      ))}
                    </Select>
                    {stepErrors?.approverId ? <p className="field__error" role="alert">{stepErrors.approverId}</p> : null}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}
        <div>
          <Button variant="secondary" size="sm" onClick={() => onChange([...value, newFormStep()])} disabled={full}>
            <PlusIcon size={14} /> {value.length ? 'Add next step' : 'Add steps'}
          </Button>
        </div>
      </fieldset>
      <p className="field__hint" id={`${id}-hint`}>
        {full
          ? `Up to ${MAX_TASK_ASSIGNEES} people per task.`
          : value.length
            ? 'Steps run top to bottom. Everybody on a step works side by side and is told together; the step goes to its approver once they have all submitted.'
            : 'Leave empty for one assignee and one approver. Add steps when the work passes between people.'}
      </p>
      {error ? <p className="field__error" role="alert">{error}</p> : null}
    </div>
  );
}

/* ---------- The task page ---------- */

function personTimes(person: TaskAssignee): string | null {
  const working = stepDurationMs(person);
  const waited = spanMs(person.reachedAt, person.startedAt);
  switch (person.status) {
    case 'TODO':
      return person.reachedAt ? `their turn since ${formatDateTime(person.reachedAt)}` : null;
    case 'IN_PROGRESS':
      return person.startedAt ? `started ${formatDateTime(person.startedAt)}` : null;
    case 'SUBMITTED':
    case 'IN_REVIEW':
    case 'DONE':
      return [
        working !== null ? `worked ${formatDuration(working)}` : null,
        waited !== null && waited >= 60_000 ? `waited ${formatDuration(waited)} to start` : null,
      ].filter(Boolean).join(' · ') || null;
    default:
      return null;
  }
}

/**
 * The flow on the task page (guide 1.9): one block per step with its status,
 * its approver and "1 of 2 submitted", and each person with their own status
 * and times. A task without steps shows its single assignee.
 */
export function TaskStepTimeline({
  task,
  resolveName,
}: {
  task: Pick<Task, 'assignees' | 'steps' | 'assignedToId' | 'assignedTo'>;
  resolveName: (id?: string | null) => string;
}) {
  const { lang } = useLocale();
  const steps = flowSteps(task);

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

  const nameOf = (person: TaskAssignee) => (person.user ? assigneeName(person) : resolveName(person.userId));
  const approverOf = (step: TaskStep) => step.approver?.fullName || step.approver?.email || resolveName(step.approverId);

  return (
    <ol className="step-timeline" aria-label="Steps">
      {steps.map((step, index) => {
        const live = step.status === 'TODO' || step.status === 'IN_PROGRESS' || step.status === 'IN_REVIEW';
        const shared = step.assignees.length > 1;
        return (
          <li
            key={step.stepOrder}
            className={`step-timeline__item step-timeline__item--${step.status.toLowerCase()}`}
            aria-current={live ? 'step' : undefined}
          >
            <span className="step-timeline__marker" aria-hidden="true">{step.status === 'DONE' ? '✓' : index + 1}</span>
            <div className="step-timeline__body">
              <p className="step-timeline__head">
                <strong>Step {index + 1} of {steps.length}</strong>
                <StepBadge status={step.status} />
                {shared && step.status !== 'PENDING' ? <span className="muted">{step.submittedCount} of {step.assigneeCount} submitted</span> : null}
              </p>
              <p className="step-timeline__meta muted">
                {step.approverId ? <>Approved by {approverOf(step)}</> : shared ? <>No approver — done when everybody submits</> : <>No approver — done on submit</>}
              </p>
              <ul className="step-timeline__people">
                {step.assignees.map((person) => {
                  const times = personTimes(person);
                  return (
                    <li key={person.id} className="step-timeline__person">
                      <p className="step-timeline__person-head">
                        <strong>{nameOf(person)}</strong>
                        <span className="muted">{taskRoleLabel(person.role, lang)}</span>
                        {/* On a one-person step the step's badge already says it. */}
                        {shared ? <StepStatusBadge status={person.status} /> : null}
                        {person.user?.status && person.user.status !== 'ACTIVE' ? <Badge tone="danger">Deactivated</Badge> : null}
                      </p>
                      {times ? <p className="step-timeline__meta muted">{times}</p> : null}
                      {person.reviewNote && person.status === 'IN_PROGRESS' ? (
                        <p className="step-timeline__note">Changes requested: {person.reviewNote}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
