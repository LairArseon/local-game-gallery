# Component Bundle Matrix

[Back to Main README](../../README.md) | [Back to Docs Hub](../README.md)

This document defines the installer component model and its current build matrix.

## Source artifacts

- Component manifest: [../../installer/components.manifest.json](../../installer/components.manifest.json)
- Build matrix: [../../installer/build-matrix.json](../../installer/build-matrix.json)

## Component model

- service
  - Headless API runtime.
  - Required by web-client and desktop-client.
- web-client
  - Browser UI artifact (dist-web-client) and Docker web image.
- desktop-client
  - Standalone desktop executable that connects to service.
- full-desktop-suite
  - Legacy/full local desktop suite installer.
  - Mutually exclusive with service + web-client + desktop-client component set.

## Build matrix summary

1. full-desktop-suite-win
- Script: npm run dist:win
- Output: release full desktop installer
- Status: implemented

2. desktop-client-win
- Script: npm run dist:standalone-client:win
- Output: standalone desktop client installer
- Status: implemented

3. web-client-static
- Script: npm run build:web-client
- Output: dist-web-client
- Status: implemented

4. service-web-compose
- Script: docker compose up (gallery-service + gallery-web)
- Output: service and web Docker images
- Status: implemented

5. bundle-installer-win
- Script: npm run dist:bundle-installer:win
- Output: installer/bundle executable
- Status: implemented

## Notes

- Service-only installer scripting is intentionally deferred while bundle installer design is being finalized.
- Docker remains the primary supported end-user path for service and web deployment.
