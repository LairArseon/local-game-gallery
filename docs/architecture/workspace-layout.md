# Workspace Layout (Multi-App Scaffold)

[Back to Main README](../../README.md) | [Back to Docs Hub](../README.md)

This document tracks the organization-first workspace split that prepares the repository for separable components:

1. Full desktop executable (current app behavior)
2. Standalone desktop client executable (connection-first client)
3. Web client artifact (browser deployment target)

## Current Phase

Phase 1 layout move is complete:
- Existing full desktop app files are now under apps/full-desktop.
- Separate standalone-client app workspace exists for independent development.
- Package and service boundaries exist for staged migration.
- No functional behavior changes were introduced to the full desktop runtime during the move.

Phase 2 standalone-client desktop pipeline is complete:
- Standalone client now has an Electron desktop shell under apps/standalone-client/electron.
- Standalone client build now produces dist-standalone-client and dist-standalone-electron.
- Standalone windows packaging config exists at apps/standalone-client/builder.json.

Phase 3 web-client boundary split is complete:
- Dedicated browser app boundary exists under apps/web-client.
- Docker web image now builds from apps/web-client.

## Folder Boundaries

- apps/full-desktop
- apps/standalone-client
- apps/web-client
- services/gallery-service

Current full desktop source locations:

- apps/full-desktop/src
- apps/full-desktop/electron
- apps/full-desktop/index.html
- apps/full-desktop/vite.config.ts
- apps/full-desktop/tsconfig.json

## Run Commands (from repo root)

Full desktop app:

```powershell
npm run dev:full-desktop
npm run build:full-desktop
npm run start:full-desktop
```

Standalone desktop client:

```powershell
npm run dev:standalone-client
npm run build:standalone-client
npm run start:standalone-client
```

Web client:

```powershell
npm run dev:web-client
npm run build:web-client
npm run preview:web-client
```

Standalone client windows packaging:

```powershell
npm run pack:standalone-client:win
npm run dist:standalone-client:win
```

## Optional Module Filters

The shared shell consumes optional `gallery.filters` contributions through the runtime module registry. A contribution's `filterData` supplies a source label, accent class, ascending/descending score modes, and `getGameData(game)` returning stored tags and a nullable score.

Only loaded, installed, enabled modules contribute to search, ordering, and tag pools. Keep module-specific metadata parsing inside the module; do not statically import optional module implementations into the host shell.

Filter presets retain normal `tagRules` unchanged and optionally persist source-qualified `moduleTagRules` (`moduleId`, `tag`, `exclude`). Missing modules suspend their rules without erasing preset data. Tag pools are derived from metadata, with suggestions and counts respecting the vault boundary.

## Next Migration Steps

1. Continue extracting reusable client adapter utilities when a second consumer appears.
2. Continue extracting reusable presentational components when desktop and web clients share stabilized UI APIs.
3. Move service entrypoint and runtime code into services/gallery-service.
4. Add component-selectable bundle installer (Service, Web Client, Desktop Client).
