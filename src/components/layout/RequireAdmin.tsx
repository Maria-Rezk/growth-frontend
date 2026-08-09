import { useAuth } from '@/context/AuthContext';
import { EmptyState } from '@/components/ui/State';
import { isPlatformAdmin } from '@/types/domain';

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (!isPlatformAdmin(user?.platformRole)) {
    return (
      <EmptyState
        title="Not authorized"
        description="This section is limited to platform administrators."
      />
    );
  }

  return <>{children}</>;
}
