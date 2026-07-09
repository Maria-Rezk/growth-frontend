import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { App } from '@/App';
import { AppErrorBoundary } from '@/components/layout/AppErrorBoundary';
import { AuthProvider } from '@/context/AuthContext';
import { LocaleProvider } from '@/context/LocaleContext';
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
        <LocaleProvider>
          <AuthProvider>
            <AppErrorBoundary>
              <a className="skip-link" href="#main-content">Skip to main content</a>
              <App />
            </AppErrorBoundary>
            <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
          </AuthProvider>
        </LocaleProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);