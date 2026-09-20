import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const proxyTarget = env.VITE_DEV_PROXY_TARGET;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          /*
            Libraries in their own chunk. They change on a dependency bump,
            not on every deploy, so returning users keep them cached while
            only the app code they actually need is re-downloaded.
          */
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            data: ['@tanstack/react-query', 'axios'],
            forms: ['react-hook-form', '@hookform/resolvers', 'zod'],
          },
        },
      },
    },
    /*
      Optional dev proxy, enabled by setting VITE_DEV_PROXY_TARGET.

      Why it exists: the API's CORS allow-list names the deployed origin only,
      and answers a preflight from http://localhost:5173 with a 500. Since the
      refresh token is an httpOnly cookie every request must be credentialed,
      and a credentialed cross-origin request cannot fall back to a wildcard —
      so local development against the live API is blocked outright.

      Proxying sidesteps it without a backend change: the browser talks to its
      own origin (set VITE_API_BASE_URL=/api), and Vite forwards server-side,
      where CORS does not apply. Nothing here affects a production build — Vite
      only serves `server.proxy` in dev.
    */
    server: proxyTarget
      ? {
        proxy: {
          '/api': {
            target: proxyTarget,
            changeOrigin: true,
            secure: true,
            // The API sets the refresh cookie for its own domain, which the
            // browser would reject on localhost. Rewriting the domain is what
            // keeps the refresh flow testable in dev.
            cookieDomainRewrite: 'localhost',
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyRequest) => {
                /*
                  Drop the browser's Origin header. Forwarding it would make
                  the API treat a server-to-server call as a cross-origin one
                  and reject the unknown localhost origin — the exact failure
                  the proxy is here to avoid. A request with no Origin is not
                  a CORS request at all.
                */
                proxyRequest.removeHeader('origin');
              });
            },
          },
        },
      }
      : undefined,
  };
});
