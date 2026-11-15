import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Where focus lands on open: an element ref, or a function that picks one inside the container. */
export type InitialFocus = RefObject<HTMLElement | null> | ((container: HTMLElement) => HTMLElement | null);

/**
 * Traps Tab focus inside `containerRef` while `active`, moves focus in on open
 * (to `initialFocus` if given, else the first focusable element), and restores
 * focus to the previously-focused element on close. Reusable for dialogs/drawers.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  initialFocus?: InitialFocus,
) {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    // Focus already inside (an element that focused itself on mount) is not
    // somewhere to return to: it is gone once the container closes.
    const focusedOnOpen = document.activeElement as HTMLElement | null;
    const previouslyFocused = focusedOnOpen && container.contains(focusedOnOpen) ? null : focusedOnOpen;

    const focusInitial = () => {
      const chosen = typeof initialFocus === 'function' ? initialFocus(container) : initialFocus?.current;
      const target =
        chosen ??
        container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
        container;
      target.focus();
    };
    focusInitial();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.offsetParent !== null || element === document.activeElement);

      if (focusables.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement;

      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [active, containerRef, initialFocus]);
}