import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Field, Input, ShowPasswordToggle } from '@/components/ui/Fields';
import { Logo } from '@/components/brand/Logo';
import { appRoutes, safeReturnPath } from '@/config/appRoutes';
import { usePageTitle } from '@/hooks/usePageTitle';

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  usePageTitle('Sign in');
  const { login, isAuthenticated, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onBlur',
  });

  // The page that sent the person here, with its filters and anchor; the
  // role-aware home when there is none (see safeReturnPath).
  const returnTo = safeReturnPath((location.state as { from?: unknown } | null)?.from);

  if (isAuthenticated) return <Navigate to={returnTo} replace />;

  const submit = form.handleSubmit(async (values) => {
    const ok = await login(values);
    if (ok) navigate(returnTo, { replace: true });
  });

  return (
    <main id="main-content" className="auth-shell" tabIndex={-1}>
      <section className="auth-card">
        <div className="auth-brand">
          <Logo height={36} title="Solu1ions — Business Development" />
          <p>Content approvals, leads and delivery in one workspace.</p>
        </div>
        <h1>Sign in</h1>
        <form className="form-grid" onSubmit={submit} noValidate>
          <Field label="Email" htmlFor="email" required error={form.formState.errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" aria-invalid={Boolean(form.formState.errors.email)} {...form.register('email')} />
          </Field>
          <Field label="Password" htmlFor="password" required error={form.formState.errors.password?.message}>
            <Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" aria-invalid={Boolean(form.formState.errors.password)} {...form.register('password')} />
          </Field>
          <ShowPasswordToggle checked={showPassword} onChange={setShowPassword} controls="password" />
          {error ? <p className="error-box" role="alert">{error}</p> : null}
          <Button type="submit" loading={form.formState.isSubmitting}>Sign in</Button>
        </form>
        <p className="auth-footnote"><Link to={appRoutes.forgotPassword}>Forgot your password?</Link></p>
        <p className="auth-footnote">Have an invitation? <Link to="/accept-invitation">Accept invitation</Link></p>
      </section>
    </main>
  );
}
