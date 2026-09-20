import { ButtonLink } from '@/components/ui/Button';
import { usePageTitle } from '@/hooks/usePageTitle';

export function NotFoundPage() {
  usePageTitle('Page not found');
  return (
    <main className="auth-shell">
      <section className="auth-card text-center">
        <div>
          <h1>Page not found</h1>
          <p className="muted">The route you requested doesn’t exist.</p>
        </div>
        <div className="button-row" style={{ justifyContent: 'center' }}>
          <ButtonLink to="/dashboard">Go to dashboard</ButtonLink>
        </div>
      </section>
    </main>
  );
}
