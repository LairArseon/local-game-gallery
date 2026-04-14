# Docker Compose Service

[Back to Main README](../../README.md) | [Back to Docs Hub](../README.md)

This repository now includes a standalone HTTP service container for browser and mobile clients.

## What it runs

- Service API container
- Web client container (static app + internal proxy to service API)
- Compose project name: local-game-gallery
- API host port: 37995
- Web host port: 4173 (configurable)
- Data directory inside container: /data
- Games root mount inside container: /games
- Metadata mirror mount inside container: /metadata-mirror

## Prerequisites

1. Install Docker Desktop.
2. Create a host folder for service data (outside this repository).
3. Create or choose the host folder that contains your game library.

## Configure docker env file

Create the env file used by compose scripts:

```powershell
Copy-Item docker/.env.example docker/.env
```

Edit docker/.env and set the values for your machine.

Variable guide:

- LGG_DATA_ROOT: host folder to mount at /data
- LGG_GAMES_ROOT: host folder to mount at /games
- LGG_METADATA_MIRROR_ROOT: host folder to mount at /metadata-mirror
- LGG_SERVICE_PUBLISHED_PORT: host port for API endpoint exposure
- LGG_SERVICE_HOST: bind host inside container (normally 0.0.0.0)
- LGG_SERVICE_PORT: internal API port used by service and web proxy
- LGG_DATA_DIR: internal data path inside service container
- LGG_RUNTIME_CONTEXT: runtime marker used by app capability policy
- LGG_WEB_PORT: host port for browser UI
- VITE_GALLERY_SERVICE_URL: browser API base path proxied by nginx

Compose scripts read docker/.env directly.

## Start service

```powershell
docker compose --env-file docker/.env -f docker/compose.yml up --build -d
```

Smoke check:

```powershell
Invoke-RestMethod http://localhost:37995/api/health
```

Open browser client:

```powershell
Start-Process "http://localhost:4173"
```

If you changed LGG_WEB_PORT in docker/.env, use that port instead.

If localhost:4173 returns 404 unexpectedly while compose is running, check for a second local process on the same port (for example Vite dev server). Stop the conflicting process or stop compose before running web dev mode.

## Stop service

```powershell
docker compose --env-file docker/.env -f docker/compose.yml down
```

## Choose what to run (no compose file edits)

You do not need to remove lines from compose.yml to change runtime shape.

- Service only:

```powershell
docker compose --env-file docker/.env -f docker/compose.yml up --build -d gallery-service
```

- Service + web:

```powershell
docker compose --env-file docker/.env -f docker/compose.yml up --build -d gallery-service gallery-web
```

- Full default stack:

```powershell
docker compose --env-file docker/.env -f docker/compose.yml up --build -d
```

Desktop Electron is not part of docker compose; it is a separate bare-metal runtime.

## Optional npm wrappers (development convenience)

These npm scripts are shortcuts for local development machines where Node/npm is already installed. They run the same Docker Compose commands shown above.

```powershell
npm run compose:up
npm run compose:down
```

## First-run config notes

- The service stores config at ${LGG_DATA_ROOT}/config.json.
- In docker runtime, gamesRoot is pinned to /games automatically.
- In docker runtime, metadataMirrorRoot is pinned to /metadata-mirror automatically.
- Setup shows both paths as read-only and explains the corresponding mount sources (LGG_GAMES_ROOT and LGG_METADATA_MIRROR_ROOT).
- Browser clients can use http://localhost:${LGG_WEB_PORT} for the UI.
- The compose web client routes API calls internally to gallery-service, so browsing works as long as this compose stack is up.
- Compose intentionally does not default to repo-local runtime folders.

## Why this matters

This enables a host-independent backend process for future mobile clients. The same API can be consumed by web and mobile frontends without requiring Electron to run.

## Docker Hub image workflow

Build and tag image for Docker Hub (adds both latest and package-version tags):

```powershell
$env:DOCKERHUB_IMAGE = "your-user/local-game-gallery-service"
npm run docker:image:service
```

Push image to Docker Hub:

```powershell
docker login
$env:DOCKERHUB_IMAGE = "your-user/local-game-gallery-service"
npm run docker:image:service:push
```

Optional multi-arch push:

```powershell
$env:DOCKERHUB_IMAGE = "your-user/local-game-gallery-service"
npm run docker:image:service -- --platform linux/amd64,linux/arm64 --push
```
