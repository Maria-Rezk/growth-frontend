import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from '@/App';
import { AppErrorBoundary } from '@/components/layout/AppErrorBoundary';
import { ThemedToaster } from '@/components/layout/ThemedToaster';
import { AuthProvider } from '@/context/AuthContext';
import { LocaleProvider } from '@/context/LocaleContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { queryClient } from '@/lib/queryClient';
import { validateRuntimeEnv } from '@/config/env';
import '@/styles/global.css';
import '@/styles/rtl.css';
import '@/styles/skeleton.css';

validateRuntimeEnv();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <LocaleProvider>
            <AuthProvider>
              <AppErrorBoundary>
                <a className="skip-link" href="#main-content">Skip to main content</a>
                <App />
              </AppErrorBoundary>
              <ThemedToaster />
            </AuthProvider>
          </LocaleProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);