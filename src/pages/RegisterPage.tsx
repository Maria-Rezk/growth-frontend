import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Fields';
import { Logo } from '@/components/brand/Logo';

const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required.'),
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const { register, isAuthenticated, error } = useAuth();
  const navigate = useNavigate();
  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', password: '' },
    mode: 'onBlur',
  });

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const submit = form.handleSubmit(async (values) => {
    const ok = await register(values);
    if (ok) navigate('/dashboard', { replace: true });
  });

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <Logo height={36} title="Solu1ions Business Development" />
          <p>Register your platform account.</p>
        </div>
        <h1>Create account</h1>
        <form className="form-grid" onSubmit={submit} noValidate>
          <Field label="Full name" htmlFor="name" error={form.formState.errors.fullName?.message}>
            <Input id="name" autoComplete="name" aria-invalid={Boolean(form.formState.errors.fullName)} {...form.register('fullName')} />
          </Field>
          <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" aria-invalid={Boolean(form.formState.errors.email)} {...form.register('email')} />
          </Field>
          <Field label="Password" htmlFor="password" hint="Minimum 8 characters." error={form.formState.errors.password?.message}>
            <Input id="password" type="password" autoComplete="new-password" aria-invalid={Boolean(form.formState.errors.password)} {...form.register('password')} />
          </Field>
          {error ? <p className="error-box" role="alert">{error}</p> : null}
          <Button type="submit" loading={form.formState.isSubmitting}>Create account</Button>
        </form>
        <p className="auth-footnote">Already have an account? <Link to="/login">Sign in</Link></p>
      </section>
    </main>
  );
}
