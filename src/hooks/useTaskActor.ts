import { useAuth } from '@/context/AuthContext';
import { useCan } from '@/hooks/usePermission';
import { isPlatformAdmin } from '@/types/domain';

/**
 * The signed-in person as the review flow sees them.
 *
 * `isAdmin` is the platform role: an Agency Admin or Super Admin may submit,
 * approve and re-route on anybody's behalf, and the activity log records the
 * press under their own name. `canChangeApprover` is the "Omar is on holiday"
 * button — Account Manager on this client, or an admin.
 */
export function useTaskActor() {
  const { user } = useAuth();
  const can = useCan();

  return {
    userId: user?.id ?? null,
    isAdmin: isPlatformAdmin(user?.platformRole),
    canChangeApprover: can('tasks:approver'),
  };
}
