import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

export function NotFoundPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card text-center">
        <h1>Page not found</h1>
        <p className="muted">The route you requested does not exist.</p>
        <Link to="/dashboard"><Button>Go to dashboard</Button></Link>
      </section>
    </main>
  );
}
