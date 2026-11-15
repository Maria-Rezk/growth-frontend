import { describe, expect, it } from 'vitest';
import { ACCOUNT_DISABLED_MESSAGE, loginErrorMessage } from './loginError';

describe('loginErrorMessage', () => {
  it('names a disabled account by its code, whatever the message says', () => {
    expect(loginErrorMessage({ statusCode: 401, code: 'ACCOUNT_DISABLED', message: 'anything' })).toBe(ACCOUNT_DISABLED_MESSAGE);
  });

  it('keeps the API message for a wrong password (a 401 with no code)', () => {
    expect(loginErrorMessage({ statusCode: 401, message: 'Invalid email or password' })).toBe('Invalid email or password');
  });

  it('falls back when nothing usable came back', () => {
    expect(loginErrorMessage(undefined)).toBe('Login failed.');
  });
});
