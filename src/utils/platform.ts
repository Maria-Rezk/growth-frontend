/**
 * Which modifier the shortcut hint should name. The palette opens on either
 * ⌘K or Ctrl+K everywhere; only the label differs, so a wrong guess costs a
 * hint, never the shortcut. Read in the browser (this app has no server
 * render), from User-Agent Client Hints where offered, else the legacy
 * `navigator.platform`, else the user agent string.
 */
export function isApplePlatform(nav: Pick<Navigator, 'platform' | 'userAgent'> & { userAgentData?: { platform?: string } } | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  if (!nav) return false;
  const source = nav.userAgentData?.platform || nav.platform || nav.userAgent || '';
  return /mac|iphone|ipad|ipod/i.test(source);
}

export interface Shortcut {
  /** What the keycap shows: "⌘K" or "Ctrl K". */
  keys: string;
  /** How the shortcut is said in a label or tooltip: "⌘K" or "Ctrl+K". */
  label: string;
  /** The `aria-keyshortcuts` value. */
  aria: string;
}

/** The modifier+key shortcut, spelled for this platform. */
export function modShortcut(key: string, apple = isApplePlatform()): Shortcut {
  const upper = key.toUpperCase();
  return apple
    ? { keys: `⌘${upper}`, label: `⌘${upper}`, aria: `Meta+${upper}` }
    : { keys: `Ctrl ${upper}`, label: `Ctrl+${upper}`, aria: `Control+${upper}` };
}
