# Frontend guidance

Use React 19, TypeScript, Vite, Motion, Zustand, SCSS and Bun 1.3.14, matching CLI Proxy API. Run bun run verify for frontend changes and browser-check affected flows. Keep bun.lock; do not add npm/yarn lockfiles.

Use @tnvn/cli-ui primitives. The upstream files listed in shared/cli-ui/UPSTREAM.json are synchronized snapshots, not application code. Update them with scripts/sync-cli-ui.py; put bot-specific adapters outside those files. Preserve upstream license and check snapshots with --check when the CLI checkout is available.

Keep Go API contracts in src/services/api.ts. Maintain abort/stale-request guards, cache cleanup on logout, form focus during polling, keyboard access and reduced-motion behavior. Never import CLI account data or management credentials.

Vite emits into ../web; do not edit generated bundle files. Production serves those assets from the Go binary; Node/Bun are build-time tools only. Keep executable scripts external to preserve the Go server CSP.
