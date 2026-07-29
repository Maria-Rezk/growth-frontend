import { ButtonLink } from '@/components/ui/Button';

export function NotFoundPage() {
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
