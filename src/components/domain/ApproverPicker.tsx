import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Field, Select } from '@/components/ui/Fields';
import { appRoutes } from '@/config/appRoutes';
import { useAsync } from '@/hooks/useAsync';
import { tasksService } from '@/services/tasks';
import { queryKeys } from '@/lib/queryClient';
import { taskTypeLabel } from '@/utils/taskTypes';
import { AGENCY_ROLES, membershipRoles } from '@/utils/roles';
import { compareNames } from '@/utils/sort';
import type { ApproverResolution, Membership, TaskType } from '@/types/domain';

/**
 * Who approves this task.
 *
 * You normally do not type a name: the responsibility matrix maps the task
 * type to an area, and whoever holds TO_APPROVE there is pre-filled. The
 * field stays editable — the matrix says who is *expected* to approve, and
 * the person creating the task can still decide otherwise.
 *
 * `autoResolve` is on for the create form and off on the task detail, where
 * the approver is already a fact on the task and re-reading the matrix would
 * overwrite a deliberate choice.
 */
export function ApproverPicker({
  id = 'task-approver',
  companyId,
  taskTypes,
  members,
  value,
  onChange,
  disabled,
  error,
  autoResolve = true,
  label = 'Approver',
}: {
  id?: string;
  companyId: string;
  taskTypes: TaskType[];
  members: Membership[];
  value: string;
  onChange: (userId: string) => void;
  disabled?: boolean;
  error?: string;
  autoResolve?: boolean;
  label?: string;
}) {
  // A stable key: the same set in a different tick order asks the same question.
  const typesKey = useMemo(() => [...taskTypes].sort().join(','), [taskTypes]);
  const hasTypes = taskTypes.length > 0;
  const resolution = useAsync(
    () => tasksService.resolveApprover(companyId, taskTypes),
    [companyId, typesKey],
    { queryKey: queryKeys.resolveApprover(companyId, typesKey), enabled: autoResolve && hasTypes },
  );

  const memberIds = useMemo(() => new Set(members.filter((m) => m.status === 'ACTIVE').map((m) => m.userId)), [members]);

  /*
    Pre-fill once per resolution. Tracking the last applied resolution key,
    rather than the value, means a user who clears the field is not fought
    with — the suggestion only lands again when the task type changes.
  */
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (!hasTypes) applied.current = null;
    if (!autoResolve || !hasTypes || !resolution.data) return;
    const key = `${companyId}:${[...resolution.data.taskTypes].sort().join(',')}`;
    if (applied.current === key) return;
    applied.current = key;
    const suggested = resolution.data.approverId;
    // Only prefill someone the list actually offers; a value with no
    // matching <option> silently snaps to the first one.
    onChange(suggested && memberIds.has(suggested) ? suggested : '');
  }, [autoResolve, companyId, hasTypes, memberIds, onChange, resolution.data]);

  const groups = useMemo(() => groupApprovers(members, resolution.data), [members, resolution.data]);
  const hint = autoResolve ? resolutionHint(hasTypes ? resolution.data : null, hasTypes && resolution.loading, taskTypes) : undefined;
  const areaNames = Array.from(new Set((resolution.data?.areas ?? []).map((area) => area.areaName)));

  return (
    <Field label={label} htmlFor={id} error={error} hint={hint?.text}>
      <Select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        <option value="">No approver yet</option>
        {groups.candidates.length ? (
          <optgroup label={areaNames.length ? `Approves ${areaNames.join(' / ')}` : 'Approves this area'}>
            {groups.candidates.map((member) => (
              <option key={member.id} value={member.userId}>{memberName(member)}</option>
            ))}
          </optgroup>
        ) : null}
        <optgroup label={groups.candidates.length ? 'Everyone else' : 'Team members'}>
          {groups.others.map((member) => (
            <option key={member.id} value={member.userId}>{memberName(member)}</option>
          ))}
        </optgroup>
      </Select>
      {hint?.matrixLink ? (
        <p className="field__hint">
          <Link to={appRoutes.responsibilities} className="table-link">Open the responsibility matrix</Link>
        </p>
      ) : null}
    </Field>
  );
}

function memberName(member: Membership): string {
  return member.user?.fullName ?? member.user?.email ?? member.userId;
}

/** Active agency-side members, with the matrix's candidates listed first. */
function groupApprovers(members: Membership[], resolution: ApproverResolution | null) {
  const candidateIds = new Set(resolution?.candidateUserIds ?? []);
  const eligible = members
    .filter((member) => member.status === 'ACTIVE')
    // Client-side roles never approve internal work.
    .filter((member) => {
      const roles = membershipRoles(member);
      return roles.length === 0 || roles.some((role) => AGENCY_ROLES.includes(role));
    })
    .sort((left, right) => compareNames(memberName(left), memberName(right)));

  return {
    candidates: eligible.filter((member) => candidateIds.has(member.userId)),
    others: eligible.filter((member) => !candidateIds.has(member.userId)),
  };
}

/** What the picker should say about how it was filled — in the words of section 5 of the guide. */
function resolutionHint(
  resolution: ApproverResolution | null,
  loading: boolean,
  taskTypes: TaskType[],
): { text: string; matrixLink?: boolean } | undefined {
  if (loading) return { text: 'Checking the responsibility matrix…' };
  if (!resolution) return { text: 'Optional. Leave it empty and the matrix decides at creation.' };
  const names = Array.from(new Set(resolution.areas.map((entry) => entry.areaName)));
  const area = names.length ? names.join(' and ') : 'this area';
  switch (resolution.reason) {
    case 'RESOLVED':
      return { text: `Pre-filled from the responsibility matrix (${area}). You can still change it.` };
    case 'MULTIPLE_APPROVERS':
      // Different types point at different people: say whose, and ask. Never guess.
      return { text: `${area} have different approvers. Who approves this task?` };
    case 'NO_APPROVER_IN_AREA':
      return { text: `Nobody active holds "To Approve" for ${area}. Pick someone here, or fill the matrix in.`, matrixLink: true };
    case 'NO_MATCHING_AREA': {
      const named = taskTypes.filter((type) => type !== 'OTHER').map((type) => taskTypeLabel(type)).join(', ');
      return {
        text: `This client has no area for ${named || 'this'} work. Pick someone, or add the area in the responsibility matrix.`,
        matrixLink: true,
      };
    }
    case 'UNMAPPED_TASK_TYPE':
      return { text: '“Other” work has no area. Name an approver, or leave it empty.' };
    default:
      return undefined;
  }
}
