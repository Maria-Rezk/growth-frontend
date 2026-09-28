import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Link, useSearchParams } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Fields';
import { appRoutes } from '@/config/appRoutes';
import { usePageTitle } from '@/hooks/usePageTitle';
import { errorMessage } from '@/lib/http';
import { authService } from '@/services/auth';
import { PASSWORD_MIN_LENGTH, type ApiErrorShape } from '@/types/domain';

const requestSchema = z.object({ email: z.string().trim().email('Enter the email you sign in with.') });
const resetSchema = z
  .object({
    password: z.string().min(PASSWORD_MIN_LENGTH, `At least ${PASSWORD_MIN_LENGTH} characters.`),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, { path: ['confirm'], message: 'The two passwords do not match.' });

/**
 * Forgot password, in two halves on one route.
 *
 * `/forgot-password` asks for the email and always answers the same way —
 * "if that address has an account, a link is on its way" — so the form
 * cannot be used to find out who has an account. `/forgot-password?token=…`
 * (the link in the email) asks for the new password. Tokens are single-use
 * and valid for an hour; a successful reset signs the account out everywhere.
 */
export function ForgotPasswordPage() {
  const [params, setParams] = useSearchParams();
  // Held in state and dropped from the address bar, so the single-use secret
  // does not sit in history or leak through a Referer header.
  const [token, setToken] = useState(() => params.get('token'));
  useEffect(() => {
    if (params.has('token')) setParams({}, { replace: true });
  }, [params, setParams]);
  usePageTitle(token ? 'Choose a new password' : 'Forgot password');

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <Logo height={36} title="Solu1ions Business Development" />
        </div>
        {token ? <ResetForm token={token} onRequestNew={() => setToken(null)} /> : <RequestForm />}
        <p className="auth-footnote"><Link to={appRoutes.login}>Back to sign in</Link></p>
      </section>
    </main>
  );
}

function describeFailure(error: unknown): string {
  if ((error as ApiErrorShape | undefined)?.statusCode === 429) return 'Too many attempts. Wait a minute and try again.';
  return errorMessage(error);
}

function RequestForm() {
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm<z.infer<typeof requestSchema>>({ resolver: zodResolver(requestSchema), defaultValues: { email: '' }, mode: 'onBlur' });

  const submit = form.handleSubmit(async (values) => {
    setFailure(null);
    try {
      await authService.requestPasswordReset(values.email);
      setSent(true);
    } catch (error) {
      setFailure(describeFailure(error));
    }
  });

  if (sent) {
    return (
      <>
        <h1>Check your email</h1>
        <p className="muted">If <strong>{form.getValues('email')}</strong> has an account, a reset link is on its way. It is valid for one hour.</p>
      </>
    );
  }

  return (
    <>
      <h1>Forgot your password?</h1>
      <p className="muted">Enter the email you sign in with and we will send a link to choose a new one.</p>
      <form className="form-grid" onSubmit={submit} noValidate>
        <Field label="Email" htmlFor="reset-email" error={form.formState.errors.email?.message}>
          <Input id="reset-email" type="email" autoComplete="email" aria-invalid={Boolean(form.formState.errors.email)} {...form.register('email')} />
        </Field>
        {failure ? <p className="error-box" role="alert">{failure}</p> : null}
        <Button type="submit" loading={form.formState.isSubmitting}>Send reset link</Button>
      </form>
    </>
  );
}

function ResetForm({ token, onRequestNew }: { token: string; onRequestNew: () => void }) {
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [linkDead, setLinkDead] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema), defaultValues: { password: '', confirm: '' }, mode: 'onBlur' });

  const submit = form.handleSubmit(async (values) => {
    setFailure(null);
    try {
      await authService.resetPassword(token, values.password);
      setDone(true);
    } catch (error) {
      // 400 means the token is wrong, used, or over an hour old — retrying cannot help.
      const apiError = error as ApiErrorShape;
      if (apiError.statusCode === 400 && !apiError.fieldErrors?.password) {
        setLinkDead(true);
        setFailure(errorMessage(error));
        return;
      }
      if (apiError.fieldErrors?.password) {
        form.setError('password', { message: apiError.fieldErrors.password });
        return;
      }
      setFailure(describeFailure(error));
    }
  });

  if (done) {
    return (
      <>
        <h1>Password changed</h1>
        <p className="muted">You have been signed out on every device. Sign in with your new password.</p>
        <Link className="btn btn--primary" to={appRoutes.login}>Sign in</Link>
      </>
    );
  }

  if (linkDead) {
    return (
      <>
        <h1>This link has expired</h1>
        <p className="muted">{failure ?? 'This reset link is no longer valid.'} Links work once and for one hour.</p>
        <Button type="button" onClick={onRequestNew}>Send me a new link</Button>
      </>
    );
  }

  return (
    <>
      <h1>Choose a new password</h1>
      <form className="form-grid" onSubmit={submit} noValidate>
        <Field label="New password" htmlFor="new-password" error={form.formState.errors.password?.message} hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}>
          <Input id="new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" {...form.register('password')} />
        </Field>
        <Field label="Confirm password" htmlFor="confirm-password" error={form.formState.errors.confirm?.message}>
          <Input id="confirm-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" {...form.register('confirm')} />
        </Field>
        <label className="checkbox-row">
          <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
          <span>Show passwords</span>
        </label>
        {failure ? <p className="error-box" role="alert">{failure}</p> : null}
        <Button type="submit" loading={form.formState.isSubmitting}>Set password</Button>
        <p className="field__hint">You will be signed out on every device, then sign in with the new password.</p>
      </form>
    </>
  );
}
