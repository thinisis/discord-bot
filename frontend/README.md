# Discord Control UI

Same UI stack as CLI Proxy API: React 19, TypeScript 6, Vite 8, Motion, Zustand, SCSS and Bun 1.3.14. Reusable controls and theme tokens come from the local @tnvn/cli-ui workspace; see shared/cli-ui/README.md for source synchronization.

```sh
bun install --frozen-lockfile
bun run verify
```

Vite emits hashed JS/CSS into ../web. The Go build embeds those assets in the existing executable. Node/Bun are build tools only; production still runs one Go process.

- BrowserRouter keeps the existing /dashboard, /guilds, /music, /logs, /settings paths.
- services/api.ts owns the Go API contract, cookie auth and session expiration.
- services/useResource.ts caches successful responses, cancels obsolete requests, retries refresh queued during an in-flight request and invalidates cache on logout.
- Motion animates route entrance, sidebar active state, tab indicators and toast presence. Inputs stay mounted during background refresh; modal and dropdown keyboard/focus behavior are retained from CLI controls.
- prefers-reduced-motion disables spatial animations and CSS transitions.
- No CLI management API key, provider credentials or CLI backend code is imported.
