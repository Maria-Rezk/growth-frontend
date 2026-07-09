import { useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Fields';

const invitationSchema = z.object({
  token: z.string().trim().min(1, 'Invitation token is required.'),
  fullName: z.string().trim().optional(),
  email: z.union([z.string().trim().email('Enter a valid email address.'), z.literal('')]).optional(),
  password: z.union([z.string().min(8, 'Password must be at least 8 characters.'), z.literal('')]).optional(),
});

type InvitationForm = z.infer<typeof invitationSchema>;

export function AcceptInvitationPage() {
  const { acceptInvitation, isAuthenticated, error } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialToken = useMemo(() => params.get('token') ?? '', [params]);
  const form = useForm<InvitationForm>({
    resolver: zodResolver(invitationSchema),
    defaultValues: { token: initialToken, fullName: '', email: '', password: '' },
    mode: 'onBlur',
  });

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const submit = form.handleSubmit(async (values) => {
    const result = await acceptInvitation({
      token: values.token.trim(),
      fullName: values.fullName?.trim() || undefined,
      email: values.email?.trim() || undefined,
      password: values.password || undefined,
    });
    if (!result.accepted) return; // error shown via `error`
    if (result.authenticated) {
      navigate('/dashboard', { replace: true });
    } else {
      toast.success('Invitation accepted. Please log in to continue.');
      navigate('/login', { replace: true });
    }
  });

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">1</span>
          <div><strong>Accept invitation</strong><p>Join a company workspace.</p></div>
        </div>
        <form className="form-grid" onSubmit={submit} noValidate>
          <Field label="Invitation token" htmlFor="token" error={form.formState.errors.token?.message}>
            <Input id="token" aria-invalid={Boolean(form.formState.errors.token)} {...form.register('token')} />
          </Field>
          <Field label="Full name" htmlFor="name" hint="Use only if this invitation creates a new account." error={form.formState.errors.fullName?.message}>
            <Input id="name" autoComplete="name" {...form.register('fullName')} />
          </Field>
          <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" aria-invalid={Boolean(form.formState.errors.email)} {...form.register('email')} />
          </Field>
          <Field label="Password" htmlFor="password" hint="Set a password to finish creating your account." error={form.formState.errors.password?.message}>
            <Input id="password" type="password" autoComplete="new-password" aria-invalid={Boolean(form.formState.errors.password)} {...form.register('password')} />
          </Field>
          {error ? <p className="error-box" role="alert">{error}</p> : null}
          <Button type="submit" loading={form.formState.isSubmitting}>Accept invitation</Button>
        </form>
        <p className="auth-footnote"><Link to="/login">Back to login</Link></p>
      </section>
    </main>
  );
}