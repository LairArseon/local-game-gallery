# Codebase Refactor Audit (Pre-Stage 3)

[Back to Main README](../../README.md) | [Back to Docs Hub](../README.md)

Date: 2026-04-13

## Summary

The current architecture is in good shape for multi-runtime usage because renderer features consume a transport-agnostic client boundary. The main risks before Stage 3 are concentrated in oversized modules and backend runtime coupling that made containerization difficult.

## Strengths

1. Client abstraction exists and is actively used by renderer hooks/components.
2. Service capabilities and version contracts are already present.
3. Browser and desktop behavior are capability-gated instead of forked UI code.

## Refactor priorities

## P0 (do before Stage 3)

1. Split large backend orchestration modules:
- electron/main.ts
- electron/service.ts

2. Introduce shared route/channel constants to remove string duplication between:
- electron/main.ts and electron/preload.ts (IPC channel names)
- electron/service.ts and src/client/adapters/webClient.ts (HTTP routes)

3. Add API-level smoke tests for:
- /api/health
- /api/version
- /api/capabilities
- /api/config
- /api/scan

## P1 (recommended shortly after P0)

1. Isolate context menu composition from web client adapter into a dedicated helper module.
2. Split src/types.ts into domain types and transport/client contracts.
3. Add lightweight request retry/backoff policy in web client for degraded LAN scenarios.

## Docker-compose track

## Completed in this milestone

1. Runtime data path is no longer hard-coupled to Electron app.getPath.
2. Standalone service entrypoint exists (electron/service-cli.ts).
3. Docker artifacts were added:
- docker/compose.yml
- docker/Dockerfile.service
- docs/operations/docker-compose.md

## Remaining work to productionize Compose

1. Add a small healthcheck command to image/container.
2. Add API smoke test runner service in compose for CI use.
3. Add secrets/auth strategy if service leaves trusted LAN scope.
4. Add bind-mount guidance for Windows path edge cases and permissions.

## Stage 3 gate

Stage 3 should start once all P0 tasks are done and Compose smoke tests are passing for:

1. service startup
2. config persistence
3. scan with mounted games root
4. metadata/media write flows
