import { useAsync } from '@/hooks/useAsync';
import { useCan } from '@/hooks/usePermission';
import { queryKeys } from '@/lib/queryClient';
import { companiesService } from '@/services/companies';
import { responsibilitiesService } from '@/services/responsibilities';
import type { Membership, ResponsibilityMatrix } from '@/types/domain';

/** An active staff member from the matrix, in the shape the member pickers already read. */
function fromMatrix(companyId: string, member: ResponsibilityMatrix['members'][number]): Membership {
  const roles = member.roles?.length ? member.roles : member.role ? [member.role] : [];
  return {
    id: `staff-${member.userId}`,
    companyId,
    userId: member.userId,
    roles,
    role: roles[0],
    status: 'ACTIVE',
    user: { id: member.userId, fullName: member.fullName, email: member.email },
  };
}

/**
 * The people on this client who can be named on a task, lead or stage.
 *
 * The member directory (`GET /members`) is open to admins and to everybody
 * who creates tasks — Account Manager, Social Media Manager and Art Director —
 * so the person putting people on a task sees who they can hand it to. Asking
 * anyway is a 403 for every other role. The responsibility matrix is readable
 * by everybody on the client and lists exactly the active staff with their
 * roles (client-side roles are excluded server-side), which is who a picker
 * needs. So: the directory where the person may read it, the matrix
 * everywhere else. Both answer with the same shape.
 */
export function useAssignableMembers(companyId: string) {
  const can = useCan();
  const canReadDirectory = can('members:manage') || can('tasks:edit');
  return useAsync<Membership[]>(
    async () => {
      if (canReadDirectory) return companiesService.members(companyId);
      const matrix = await responsibilitiesService.matrix(companyId);
      return matrix.members.map((member) => fromMatrix(companyId, member));
    },
    [companyId, canReadDirectory],
    { queryKey: canReadDirectory ? queryKeys.companyMembers(companyId) : queryKeys.companyStaff(companyId) },
  );
}
