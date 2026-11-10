import { errorCode } from '@/lib/http';
import { AuthErrorCode, type ApiErrorShape } from '@/types/domain';

/** Shown for a disabled account. The person cannot fix it themselves, so it says who can. */
export const ACCOUNT_DISABLED_MESSAGE = 'This account has been disabled. Ask an administrator to reactivate it.';

/**
 * What the sign-in form says when sign-in fails.
 *
 * A disabled account (correct password, `INACTIVE` or `SUSPENDED`) answers
 * 401 with `code: ACCOUNT_DISABLED`; a wrong password answers a bare 401. The
 * two must read differently — "check your password" would send a disabled
 * person round in circles — so this switches on the code, never the message.
 */
export function loginErrorMessage(error: unknown): string {
  if (errorCode(error) === AuthErrorCode.ACCOUNT_DISABLED) return ACCOUNT_DISABLED_MESSAGE;
  const message = (error as ApiErrorShape | Error | undefined)?.message;
  return message || 'Login failed.';
}
