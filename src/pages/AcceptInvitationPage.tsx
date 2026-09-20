import { useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Fields';
import { Logo } from '@/components/brand/Logo';
import { appRoutes, unwrapInvitationToken } from '@/config/appRoutes';
import { usePageTitle } from '@/hooks/usePageTitle';

/*
  Contract: POST /auth/accept-invitation
    new user      → { token, fullName, password }
    existing user → { token }

  There is deliberately no email field. The invited address is bound to the
  token server-side, so asking for it again can only introduce a mismatch the
  user has no way to resolve.

  fullName and password are optional here because an already-registered
  invitee just claims the membership. authService omits empty optionals rather
  than sending "" so the DTO's @MinLength doesn't reject a valid existing-user
  request.
*/
const invitationSchema = z
  .object({
    token: z.string().trim().min(1, 'Invitation token is required.'),
    fullName: z.string().trim().optional(),
    password: z.union([z.string().min(8, 'Password must be at least 8 characters.'), z.literal('')]).optional(),
  })
  // Setting a password means creating an account, which needs a name too.
  .refine((values) => !values.password || (values.fullName?.trim().length ?? 0) >= 2, {
    message: 'Full name is required when setting a password.',
    path: ['fullName'],
  });

type InvitationForm = z.infer<typeof invitationSchema>;

export function AcceptInvitationPage() {
  usePageTitle('Accept invitation');
  const { acceptInvitation, isAuthenticated, error } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialToken = useMemo(() => unwrapInvitationToken(params.get('token') ?? ''), [params]);

  const form = useForm<InvitationForm>({
    resolver: zodResolver(invitationSchema),
    defaultValues: { token: initialToken, fullName: '', password: '' },
    mode: 'onBlur',
  });

  if (isAuthenticated) return <Navigate to={appRoutes.dashboard} replace />;

  const submit = form.handleSubmit(async (values) => {
    const result = await acceptInvitation({
      token: unwrapInvitationToken(values.token),
      fullName: values.fullName?.trim() || undefined,
      password: values.password || undefined,
    });

    if (!result.accepted) return; // surfaced through `error`

    if (result.authenticated) {
      navigate(appRoutes.dashboard, { replace: true });
    } else {
      toast.success('Invitation accepted. Please log in to continue.');
      navigate(appRoutes.login, { replace: true });
    }
  });

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <Logo height={36} title="Solu1ions Business Development" />
          <p>Join a company workspace.</p>
        </div>
        <h1>Accept invitation</h1>
        <form className="form-grid" onSubmit={submit} noValidate>
          <Field
            label="Invitation token"
            htmlFor="token"
            hint={initialToken ? 'Filled from your invitation link.' : 'Paste the token from your invitation email.'}
            error={form.formState.errors.token?.message}
          >
            <Input id="token" aria-invalid={Boolean(form.formState.errors.token)} {...form.register('token')} />
          </Field>
          <Field
            label="Full name"
            htmlFor="name"
            hint="Only needed if this invitation creates a new account."
            error={form.formState.errors.fullName?.message}
          >
            <Input
              id="name"
              autoComplete="name"
              aria-invalid={Boolean(form.formState.errors.fullName)}
              {...form.register('fullName')}
            />
          </Field>
          <Field
            label="Password"
            htmlFor="password"
            hint="Leave blank if you already have an account."
            error={form.formState.errors.password?.message}
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(form.formState.errors.password)}
              {...form.register('password')}
            />
          </Field>
          {error ? <p className="error-box" role="alert">{error}</p> : null}
          <Button type="submit" loading={form.formState.isSubmitting}>Accept invitation</Button>
        </form>
        <p className="auth-footnote"><Link to={appRoutes.login}>Back to login</Link></p>
      </section>
    </main>
  );
}
