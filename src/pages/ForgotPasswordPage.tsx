import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Link, useSearchParams } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Fields';
import { appRoutes } from '@/config/appRoutes';
import { usePageTitle } from '@/hooks/usePageTitle';
import { errorMessage, isRouteMissing } from '@/lib/http';
import { authService } from '@/services/auth';

const requestSchema = z.object({ email: z.string().trim().email('Enter the email you sign in with.') });
const resetSchema = z
  .object({
    password: z.string().min(8, 'At least 8 characters.'),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, { path: ['confirm'], message: 'The two passwords do not match.' });

/**
 * Forgot password, in two halves on one route.
 *
 * `/forgot-password` asks for the email and always answers the same way —
 * "if that address has an account, a link is on its way" — so the form
 * cannot be used to find out who has an account. `/forgot-password?token=…`
 * (the link in the email) asks for the new password.
 *
 * The backend endpoints are the seam: until they ship, a route miss is
 * turned into a sentence that says so, rather than "Cannot POST /auth/…".
 */
export function ForgotPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  usePageTitle(token ? 'Choose a new password' : 'Forgot password');

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <Logo height={36} title="Solu1ions Business Development" />
        </div>
        {token ? <ResetForm token={token} /> : <RequestForm />}
        <p className="auth-footnote"><Link to={appRoutes.login}>Back to sign in</Link></p>
      </section>
    </main>
  );
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
      setFailure(isRouteMissing(error)
        ? 'Password reset is not available on this server yet. Ask an admin to reset your password from the Employees page.'
        : errorMessage(error));
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

function ResetForm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema), defaultValues: { password: '', confirm: '' }, mode: 'onBlur' });

  const submit = form.handleSubmit(async (values) => {
    setFailure(null);
    try {
      await authService.resetPassword(token, values.password);
      setDone(true);
    } catch (error) {
      setFailure(isRouteMissing(error) ? 'Password reset is not available on this server yet.' : errorMessage(error));
    }
  });

  if (done) {
    return (
      <>
        <h1>Password changed</h1>
        <p className="muted">You can sign in with the new one now.</p>
        <Link className="btn btn--primary" to={appRoutes.login}>Sign in</Link>
      </>
    );
  }

  return (
    <>
      <h1>Choose a new password</h1>
      <form className="form-grid" onSubmit={submit} noValidate>
        <Field label="New password" htmlFor="new-password" error={form.formState.errors.password?.message} hint="At least 8 characters.">
          <Input id="new-password" type="password" autoComplete="new-password" {...form.register('password')} />
        </Field>
        <Field label="Confirm password" htmlFor="confirm-password" error={form.formState.errors.confirm?.message}>
          <Input id="confirm-password" type="password" autoComplete="new-password" {...form.register('confirm')} />
        </Field>
        {failure ? <p className="error-box" role="alert">{failure}</p> : null}
        <Button type="submit" loading={form.formState.isSubmitting}>Set password</Button>
      </form>
    </>
  );
}
