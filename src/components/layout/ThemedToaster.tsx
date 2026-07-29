import { Toaster } from 'react-hot-toast';

/**
 * react-hot-toast paints its own hardcoded white surface, which reads as a
 * bug in dark mode. Feeding it the design tokens keeps toasts on-theme
 * without a second colour system.
 */
export function ThemedToaster() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3500,
        style: {
          background: 'var(--surface)',
          color: 'var(--ink)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-md)',
          boxShadow: 'var(--shadow-md)',
          fontSize: '13.5px',
          padding: '10px 14px',
          maxWidth: '380px',
        },
        success: { iconTheme: { primary: 'var(--success)', secondary: 'var(--surface)' } },
        error: { iconTheme: { primary: 'var(--danger)', secondary: 'var(--surface)' } },
      }}
    />
  );
}
