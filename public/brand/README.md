# Not used — safe to delete this folder

The lockup is now **inlined** in `src/components/brand/Logo.tsx`, so no runtime
artwork file is fetched and no light/dark pair is needed. The wordmark renders
in `currentColor` and retints itself per theme.

The artwork source of truth is `src/components/brand/Full Logo.svg`, kept next
to the component. If you edit it, re-inline the changed paths into `Logo.tsx`.
