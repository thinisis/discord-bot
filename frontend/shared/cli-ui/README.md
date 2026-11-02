# @tnvn/cli-ui

Reusable React primitives from the CLI Proxy API frontend running on this server.

The 19 upstream source files (Button, Input, Card, EmptyState, LoadingSpinner, Modal, Select, ToggleSwitch, Skeleton, icons, scroll locking, SCSS themes/tokens) are preserved byte-for-byte. `UPSTREAM.json` records their hashes. Discord Control imports this workspace package instead of maintaining separate copies of those controls.

Sync from a local CLI checkout:

```sh
python3 frontend/scripts/sync-cli-ui.py --source /path/to/cli/frontend
python3 frontend/scripts/sync-cli-ui.py --source /path/to/cli/frontend --check
```

Sync is explicit: it does not modify or deploy the running CLI Proxy API application. The bot consumes a pinned source snapshot so independent releases remain reproducible.

`src/Select.tsx` is a small integration adapter: an Escape already consumed by the dropdown does not bubble into a parent Modal. Upstream files remain unchanged. Application-specific layout, data, routing and API contracts live outside this package.

License retained from upstream in LICENSE. SVG icons include upstream Lucide attribution.
