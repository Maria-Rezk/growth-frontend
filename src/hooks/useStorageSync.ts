import { useEffect, useRef } from 'react';

/**
 * Reacts to another tab changing one `localStorage` key — a login, logout,
 * token refresh, or workspace switch elsewhere. The `storage` event only ever
 * fires in *other* tabs/windows of the same origin, never the one that made
 * the change, so this is exactly "did something change my session behind my
 * back" and nothing more.
 */
export function useStorageSync(key: string, onChange: (newValue: string | null) => void): void {
  // A ref, not a dependency: `onChange` is typically a fresh closure every
  // render (it reads current state), and resubscribing the listener on every
  // render would be wasteful. The ref keeps the listener itself stable while
  // still always calling the latest logic.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key !== key) return;
      onChangeRef.current(event.newValue);
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [key]);
}
