import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Fields';
import { Logo } from '@/components/brand/Logo';

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { login, isAuthenticated, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onBlur',
  });

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const submit = form.handleSubmit(async (values) => {
    const ok = await login(values);
    if (ok) {
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/dashboard';
      navigate(from, { replace: true });
    }
  });

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <Logo height={36} title="Solu1ions Business Development" />
          <p>Content approvals, leads and delivery in one workspace.</p>
        </div>
        <h1>Sign in</h1>
        <form className="form-grid" onSubmit={submit} noValidate>
          <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" aria-invalid={Boolean(form.formState.errors.email)} {...form.register('email')} />
          </Field>
          <Field label="Password" htmlFor="password" error={form.formState.errors.password?.message}>
            <Input id="password" type="password" autoComplete="current-password" aria-invalid={Boolean(form.formState.errors.password)} {...form.register('password')} />
          </Field>
          {error ? <p className="error-box" role="alert">{error}</p> : null}
          <Button type="submit" loading={form.formState.isSubmitting}>Login</Button>
        </form>
        <p className="auth-footnote">No account? <Link to="/register">Create one</Link> · <Link to="/accept-invitation">Accept invitation</Link></p>
      </section>
    </main>
  );
}
