# Web Client App Boundary

This folder contains the dedicated browser client artifact used by Docker and future standalone web deployments.

Current implementation status:
- Web renderer source now lives in apps/web-client/src.
- Web build output is emitted to dist-web-client.
- Docker web image now builds from this app boundary.
- Startup flow auto-discovers compatible services and falls back to manual backend URL entry when needed.

Run commands from repo root:

```powershell
npm run dev:web-client
npm run build:web-client
npm run preview:web-client
npm run start:web-client
```

Tray runtime:
- `npm run start:web-client` runs a tray-only host (no app window) and serves the browser client at `http://127.0.0.1:4173` by default.
- Default backend check endpoint is `http://127.0.0.1:37995` and can be overridden via `LGG_WEB_BACKEND_URL`.
- Web host endpoint can be overridden with `LGG_WEB_HOST` and `LGG_WEB_PORT`.

Migration intent:
- Keep the full desktop executable stable under apps/full-desktop.
- Evolve apps/web-client independently for browser-first workflows.
