# Stage 2 Phase 1 Execution Checklist

[Back to Main README](../../README.md) | [Back to Docs Hub](../README.md)

This checklist operationalizes Phase 1 from stage2-browser-plan.md with exact file-level tasks.

## Status (2026-04-13)

- Phase 1 implementation complete.
- Renderer hooks/components now use GalleryClient, with renderer boundary isolated to the client adapter.
- Desktop build verification completed after migration batches.

## 0. Locked constraints for this phase

- Browser/mobile clients are gallery-only.
- Launch remains host-desktop-only.
- Service must already be running for browser/mobile access.
- Stage 2 backend must expose API version, capabilities, and health/status.

## 1. Target result for Phase 1

Renderer feature hooks stop calling window.gallery directly and instead use a GalleryClient abstraction injected at app runtime.

Completion criteria:
- No direct window.gallery usage in feature hooks/components (except adapter/provider boundary).
- Desktop behavior unchanged.
- Contracts include version/capabilities/health for Stage 2 and Stage 3 readiness.

## 2. Files to create

## 2.1 Client contracts and runtime wiring

1. src/client/contracts.ts
- Define transport-agnostic client contracts used by hooks.
- Include:
  - GalleryClient (feature operations).
  - ServiceCapabilities (explicit launch capability flags).
  - ServiceHealthStatus (service readiness/status metadata).
  - ServiceApiVersionInfo (API version discovery).

2. src/client/context.ts
- React context for GalleryClient.
- Export provider and typed consumer hook.

3. src/client/adapters/electronClient.ts
- Adapter implementation that proxies to window.gallery.
- Single boundary where window.gallery is referenced from renderer side.

4. src/client/runtime.ts
- Runtime factory for client selection (desktop now, web later).
- For Phase 1, wire electron adapter as default.

## 2.2 Web adapter scaffold (stub for Stage 2 next steps)

5. src/client/adapters/webClient.ts
- Stubbed adapter shape matching GalleryClient.
- Use TODO markers for endpoint implementation in Phase 2.

## 3. Files to update

## 3.1 Shared type contracts

1. src/types.ts
- Add shared types for:
  - ServiceCapabilities
  - ServiceHealthStatus
  - ServiceApiVersionInfo
- Extend GalleryApi with:
  - getServiceCapabilities
  - getServiceHealth
  - getApiVersion

## 3.2 Electron bridge and handlers (contract plumbing only)

2. electron/preload.ts
- Expose new bridge methods:
  - getServiceCapabilities
  - getServiceHealth
  - getApiVersion

3. electron/main.ts
- Add IPC handlers:
  - gallery:get-service-capabilities
  - gallery:get-service-health
  - gallery:get-api-version
- Return desktop-host capabilities:
  - supportsLaunch = true
  - clientMode = desktop
  - launchPolicy = host-desktop-only

## 3.3 Renderer bootstrap

4. src/main.tsx
- Mount GalleryClient provider with runtime-selected client.

5. src/App.tsx
- Replace remaining direct window.gallery usage by consuming injected GalleryClient.
- Keep orchestration behavior unchanged.

## 3.4 Hook refactor order (exact files)

Phase 1 priority (must complete):

1. src/hooks/useAppLifecycleHandlers.ts
2. src/hooks/useGameActions.ts
3. src/hooks/useMediaManager.ts

Phase 1 extended set (recommended if time allows):

4. src/hooks/useMetadataManager.ts
5. src/hooks/useFilterManager.ts
6. src/hooks/useTagPoolManager.ts
7. src/hooks/useStartupTagPoolSync.ts
8. src/hooks/useVersionMismatchManager.ts
9. src/hooks/useLogViewer.ts
10. src/hooks/useAppIconSettings.ts
11. src/hooks/useAppViewHandlers.ts
12. src/hooks/useContextMenuListeners.ts
13. src/hooks/useVaultManager.ts

## 4. Direct window.gallery usage baseline to eliminate

Current usage is concentrated in:
- src/App.tsx
- src/hooks/useAppLifecycleHandlers.ts
- src/hooks/useGameActions.ts
- src/hooks/useMediaManager.ts
- src/hooks/useMetadataManager.ts
- src/hooks/useFilterManager.ts
- src/hooks/useTagPoolManager.ts
- src/hooks/useStartupTagPoolSync.ts
- src/hooks/useVersionMismatchManager.ts
- src/hooks/useLogViewer.ts
- src/hooks/useAppIconSettings.ts
- src/hooks/useAppViewHandlers.ts
- src/hooks/useContextMenuListeners.ts
- src/hooks/useVaultManager.ts

Phase 1 success metric:
- These files call useGalleryClient/context contract instead of window.gallery.

## 5. API/capability shape to lock now

ServiceApiVersionInfo example:
- apiVersion: string
- serviceName: string
- serviceBuild: string

ServiceCapabilities example:
- supportsLaunch: boolean
- launchPolicy: 'host-desktop-only'
- supportsNativeContextMenu: boolean
- supportsTrayLifecycle: boolean
- clientMode: 'desktop' | 'web' | 'mobile'

ServiceHealthStatus example:
- status: 'ok' | 'degraded' | 'starting'
- startedAt: string
- host: string
- port: number
- transport: 'ipc' | 'http'

## 6. Validation checklist

After each refactor batch:

1. Typecheck/build clean.
2. Desktop smoke flow:
- load config
- scan
- metadata edit
- media import/reorder/remove
- play from desktop
- vault open/close

3. Contract checks:
- getApiVersion returns value.
- getServiceCapabilities returns desktop-host profile.
- getServiceHealth returns ok/degraded model.

## 7. Suggested PR slicing

1. PR A: contracts plus provider skeleton.
2. PR B: preload/main new capability/version/health IPC.
3. PR C: refactor first 3 hooks plus App/main wiring.
4. PR D: extended hook migration.
5. PR E: cleanup and dead-code removal.

## 8. Explicit non-goals for Phase 1

- No HTTP server implementation yet.
- No tray lifecycle implementation yet (only contract hooks if needed).
- No browser runtime shipping yet.
- No mobile client implementation yet.

## 9. Handoff to Phase 2

Phase 2 can start when all are true:

1. Renderer uses GalleryClient abstraction everywhere.
2. Desktop IPC parity remains stable.
3. API version/capabilities/health contracts exist and are consumed.
4. Hook behavior parity verified by smoke tests.
