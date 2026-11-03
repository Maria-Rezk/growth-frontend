import { useAuth } from '@/context/AuthContext';
import { isSuperAdmin } from '@/types/domain';

/** `true` when the signed-in user is a Super Admin. For non-JSX branches; `SuperAdminOnly` is the JSX form. */
export function useIsSuperAdmin(): boolean {
  const { user } = useAuth();
  return isSuperAdmin(user?.platformRole);
}
