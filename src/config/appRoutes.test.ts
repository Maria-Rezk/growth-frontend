// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { safeReturnPath } from './appRoutes';

describe('safeReturnPath', () => {
  it('keeps the whole internal destination: path, query and hash', () => {
    expect(safeReturnPath({ pathname: '/leads', search: '?status=INTERESTED&view=table', hash: '#notes' }))
      .toBe('/leads?status=INTERESTED&view=table#notes');
  });

  it('keeps a path on its own', () => {
    expect(safeReturnPath({ pathname: '/tasks/task-1', search: '', hash: '' })).toBe('/tasks/task-1');
  });

  it('falls back to the role-aware home when nothing asked for sign-in', () => {
    expect(safeReturnPath(undefined)).toBe('/');
    expect(safeReturnPath(null)).toBe('/');
    expect(safeReturnPath('not a location')).toBe('/');
    expect(safeReturnPath({})).toBe('/');
  });

  it('honours a caller-supplied fallback', () => {
    expect(safeReturnPath(undefined, '/my-work')).toBe('/my-work');
  });

  it.each([
    ['a protocol-relative URL', '//evil.example/steal'],
    ['an absolute URL', 'https://evil.example/'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a backslash that browsers read as a slash', '/\\evil.example'],
    ['a tab hidden inside "//", which URL parsing strips', '/\t/evil.example'],
    ['a newline hidden inside "//"', '/\n/evil.example'],
    ['a relative path', 'leads'],
  ])('refuses %s', (_case, pathname) => {
    expect(safeReturnPath({ pathname, search: '', hash: '' })).toBe('/');
  });

  it.each(['/login', '/forgot-password', '/accept-invitation'])('never returns to the auth page %s', (pathname) => {
    expect(safeReturnPath({ pathname, search: '?x=1', hash: '' })).toBe('/');
  });

  it('drops a query or hash that is not one', () => {
    expect(safeReturnPath({ pathname: '/leads', search: 'status=NEW', hash: 'top' })).toBe('/leads');
  });

  it('cannot be pushed off the origin by what follows the path', () => {
    expect(safeReturnPath({ pathname: '/leads', search: '?next=https://evil.example', hash: '#//evil.example' }))
      .toBe('/leads?next=https://evil.example#//evil.example');
  });
});
