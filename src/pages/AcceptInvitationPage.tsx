import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Field, FieldGroup, Input } from '@/components/ui/Fields';
import { Logo } from '@/components/brand/Logo';
import { appRoutes, unwrapInvitationToken } from '@/config/appRoutes';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PASSWORD_MIN_LENGTH } from '@/types/domain';

/*
  Contract: POST /auth/accept-invitation
    new user      → { token, fullName, password }
    existing user → { token }

  There is deliberately no email field. The invited address is bound to the
  token server-side, so asking for it again can only introduce a mismatch the
  user has no way to resolve.

  Which of the two it is, the page cannot know: nothing tells the frontend
  whether the invited address already has an account. So the invitee says,
  and only the fields that path needs are shown, each marked for what it is
  on that path (N-10). "I already have one" is the default because it is
  what a blank form always sent: { token } alone. An existing-account
  request never carries a name or password, even if one was typed before
  switching; authService omits the empty optionals so the DTO's @MinLength
  doesn't reject it.
*/
const invitationSchema = z
  .object({
    token: z.string(),
    account: z.enum(['existing', 'new']),
    fullName: z.string().optional(),
    password: z.string().optional(),
  })
  // One refinement for everything, so a missing token and a missing name are reported together.
  .superRefine((values, ctx) => {
    if (!values.token.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['token'], message: 'Invitation token is required.' });
    if (values.account !== 'new') return;
    if ((values.fullName?.trim().length ?? 0) < 2) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fullName'], message: 'Full name is required for a new account.' });
    if ((values.password ?? '').length < PASSWORD_MIN_LENGTH) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` });
  });

type InvitationForm = z.infer<typeof invitationSchema>;

export function AcceptInvitationPage() {
  usePageTitle('Accept invitation');
  const { acceptInvitation, isAuthenticated, error } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // Held in state and dropped from the address bar, as on /forgot-password:
  // the token is a single-use secret and must not sit in history or leak
  // through a Referer header once the page has read it.
  const [linkToken] = useState(() => unwrapInvitationToken(params.get('token') ?? ''));
  useEffect(() => {
    if (params.has('token')) setParams({}, { replace: true });
  }, [params, setParams]);
  // Arriving from the emailed link, the token is not something to read or
  // edit. The field appears only without a link, or on request.
  const [showTokenField, setShowTokenField] = useState(!linkToken);

  const form = useForm<InvitationForm>({
    resolver: zodResolver(invitationSchema),
    defaultValues: { token: linkToken, account: 'existing', fullName: '', password: '' },
    mode: 'onBlur',
  });

  const creating = form.watch('account') === 'new';

  if (isAuthenticated) return <Navigate to={appRoutes.dashboard} replace />;

  const submit = form.handleSubmit(async (values) => {
    const isNew = values.account === 'new';
    const result = await acceptInvitation({
      token: unwrapInvitationToken(values.token),
      fullName: isNew ? values.fullName?.trim() || undefined : undefined,
      password: isNew ? values.password || undefined : undefined,
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
    <main id="main-content" className="auth-shell" tabIndex={-1}>
      <section className="auth-card">
        <div className="auth-brand">
          <Logo height={36} title="Solu1ions Business Development" />
          <p>Join a company workspace.</p>
        </div>
        <h1>Accept invitation</h1>
        <form className="form-grid" onSubmit={submit} noValidate>
          {showTokenField ? (
            <Field
              label="Invitation token"
              htmlFor="token" required
              hint="Paste the token from your invitation email."
              error={form.formState.errors.token?.message}
            >
              <Input id="token" autoComplete="off" aria-invalid={Boolean(form.formState.errors.token)} {...form.register('token')} />
            </Field>
          ) : (
            <div className="field">
              <p className="field__hint" role="status">Your invitation link has been recognised.</p>
              <div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowTokenField(true)}>
                  Use a different invitation token
                </Button>
              </div>
            </div>
          )}
          <FieldGroup
            label="Do you already have an account?"
            hint={creating ? undefined : 'Accept, then sign in with your usual email and password.'}
          >
            <div className="choice-chips">
              <label className="choice-chip">
                <input type="radio" value="existing" {...form.register('account')} />
                <span>Yes, I have an account</span>
              </label>
              <label className="choice-chip">
                <input type="radio" value="new" {...form.register('account')} />
                <span>No, create my account</span>
              </label>
            </div>
          </FieldGroup>
          {creating ? (
            <>
              <Field label="Full name" htmlFor="name" required error={form.formState.errors.fullName?.message}>
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
                required
                hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
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
            </>
          ) : null}
          {error ? <p className="error-box" role="alert">{error}</p> : null}
          <Button type="submit" loading={form.formState.isSubmitting}>Accept invitation</Button>
        </form>
        <p className="auth-footnote"><Link to={appRoutes.login}>Back to login</Link></p>
      </section>
    </main>
  );
}
