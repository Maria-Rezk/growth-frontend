import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from '@/App';
import { AppErrorBoundary } from '@/components/layout/AppErrorBoundary';
import { DevApiWarning } from '@/components/layout/DevApiWarning';
import { NetworkStatusToast } from '@/components/layout/NetworkStatusToast';
import { ThemedToaster } from '@/components/layout/ThemedToaster';
import { ConfirmProvider } from '@/components/ui/ConfirmProvider';
import { AuthProvider } from '@/context/AuthProvider';
import { LocaleProvider } from '@/context/LocaleProvider';
import { ThemeProvider } from '@/context/ThemeProvider';
import { queryClient } from '@/lib/queryClient';
import { validateRuntimeEnv } from '@/config/env';
import '@/styles/global.css';
import '@/styles/rtl.css';
import '@/styles/skeleton.css';
import '@/styles/admin.css';

validateRuntimeEnv();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <LocaleProvider>
            <AuthProvider>
              <AppErrorBoundary>
                <ConfirmProvider>
                  {/* Every page's <main> is #main-content, the app shell's and the
                      sign-in, loading and public report pages' alike (A-6). */}
                  <a className="skip-link" href="#main-content">Skip to main content</a>
                  <DevApiWarning />
                  <App />
                </ConfirmProvider>
              </AppErrorBoundary>
              <ThemedToaster />
              <NetworkStatusToast />
            </AuthProvider>
          </LocaleProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);