# Stage 2 Plan: Browser Access and Layered Architecture

[Back to Main README](../../README.md) | [Back to Docs Hub](../README.md)

## 1. Objective

Enable Local Game Gallery to run from a browser while preserving the current desktop app, by separating UI and data/platform layers behind a shared client interface.

Primary outcomes:
- Shared React UI for desktop and browser.
- Transport-agnostic data layer (no direct platform calls inside feature hooks).
- Web backend that exposes the same core capabilities currently provided by Electron IPC.
- Full gallery-management parity target across desktop, browser, and future mobile clients.
- Launch execution remains host-desktop-only; browser clients are gallery-only by design.

Service lifecycle outcomes for Stage 2:
- Opening the desktop app starts (or reconnects to) the backend service.
- Closing the desktop window closes only the UI, while backend service keeps running.
- System tray icon indicates service is active and provides status/info.
- Tray right-click menu allows reopening desktop UI and managing service state.
- Browser access depends on the running service; if service is not running, backend is unavailable by design.

## 2. Decisions Confirmed Before Implementation

These decisions are locked for Stage 2 initial rollout:

1. Browser access model:
- LAN-only access.
- Tailscale mesh VPN is considered part of allowed LAN/private-network access.
- No public internet exposure planned.

2. Authentication requirement:
- No separate web authentication layer for Stage 2.
- Vault PIN remains content-level privacy control in app workflows.

3. Launch behavior from browser:
- Browser expects backend service to already be running on host.
- If service is not running, browser app cannot connect; this is acceptable behavior.
- Web UI omits launch controls entirely.

4. Service lifecycle behavior:
- Desktop UI acts as frontend to a persistent background service.
- Closing desktop UI should not stop the service.
- Tray is the control surface for reopening UI and service visibility/control.

5. Feature parity target:
- Target same gallery-management functions as current desktop app.
- Launch remains a host-desktop capability and is intentionally excluded from browser/mobile clients.
- Any temporary parity gaps must be documented and tracked to closure.

## 3. Scope and Non-Goals

### In scope for Stage 2 initial milestone

- Reuse current UI components and styling with minimal visual changes.
- Abstract data access from hooks/components.
- Provide a web runtime path with backend API.
- Preserve desktop app behavior.
- Add tray-managed persistent service lifecycle on desktop.
- Deliver LAN browser access through the running service.
- Track and close parity gaps toward full feature coverage.
- Add mobile-ready backend primitives now (API versioning, capabilities endpoint, health/status endpoint).

### Out of scope for Stage 2 initial milestone

- Multi-user account system.
- Internet deployment hardening.
- Real-time collaborative editing.
- Mobile-first redesign.
- Automatic background service bootstrap from browser-only entry.
- Remote launch from browser/mobile clients.

## 4. Target Architecture

## 4.1 Renderer

- Keep current React app and hooks.
- Replace direct platform calls with a single injected client interface.

Proposed renderer layering:
- UI components.
- Feature hooks.
- GalleryClient interface.
- Platform adapter implementation.

## 4.2 Platform adapters

1. Electron adapter:
- Wrap current window.gallery calls.
- Preserve existing desktop behavior.

2. Web adapter:
- Use HTTP (and optional SSE/WebSocket later).
- Match GalleryClient contracts used by hooks.

## 4.3 Backend

- New web API server process.
- Reuse or port file-system and metadata logic from Electron services.
- Keep shared contracts aligned with src/types.ts.
- Add explicit API versioning strategy from day one.
- Add capability and service-status endpoints for multi-client UX adaptation.

## 4.4 Desktop service host and tray

- Desktop runtime hosts a persistent service process (or persistent mode within main process).
- Browser and desktop UI both consume the same service API contracts.
- Tray menu provides at least:
	- Open app window
	- Service status/info
	- Stop service (optional for milestone, required by Stage 2.x)
	- Exit app + stop service
- Window close should hide/close UI only, not terminate service.

## 5. Step-by-Step Execution Plan

## Phase 0: Contract and scope freeze (0.5 to 1 day)

1. Translate locked decisions in section 2 into acceptance criteria.
2. Freeze API surface for service + client adapters.
3. Define LAN binding/service discovery configuration (host, port, tray status text).

Deliverable:
- Approved Stage 2 scope baseline with explicit service lifecycle criteria.

## Phase 1: Renderer data-layer abstraction (2 to 4 days)

1. Create GalleryClient interface module (runtime-facing, transport-agnostic).
2. Create Electron client adapter that proxies to window.gallery.
3. Add dependency injection via provider/context or app-level factory.
4. Refactor hooks to consume GalleryClient instead of window.gallery directly.

Priority refactor order:
1. useAppLifecycleHandlers
2. useGameActions
3. useMediaManager
4. useMetadataManager
5. useFilterManager
6. Remaining hooks using direct platform calls

Deliverables:
- Desktop app still works with no behavior regressions.
- No direct window.gallery calls left inside feature hooks/components (except adapter).

## Phase 2: Web backend bootstrap (2 to 4 days)

1. Create a web server package/folder.
2. Add endpoints for:
- Config load/save
- Scan
- Metadata save
- Media import/reorder/remove
- Logs read/clear
- Play request through host service runtime
- Vault and version-notification operations at parity level
- Service capabilities and API version discovery
- Health/service-status endpoint for browser/mobile clients
3. Add validation and error normalization.
4. Keep API shape aligned with renderer contracts.

Deliverables:
- Runnable LAN API service serving parity-focused operations.

## Phase 2.1: Tray and persistent service lifecycle (1 to 2 days)

1. Add tray icon + context menu in desktop runtime.
2. Implement close-window-to-background behavior.
3. Expose service status metadata for tray display and diagnostics.
4. Implement reopen-app action from tray.

Deliverables:
- Desktop UI can be closed/reopened while service remains active.
- Tray clearly signals service running state.

## Phase 3: Web client adapter and browser runtime (2 to 3 days)

1. Implement web GalleryClient adapter calling backend API.
2. Add runtime selection (desktop adapter vs web adapter).
3. Add web start scripts and environment wiring.
4. Verify end-to-end browser flow over LAN/Tailscale target URL.
5. Hide/omit launch controls in web runtime based on capabilities.

Deliverables:
- App usable in browser against running host service.
- Browser app provides gallery flows only, with no launch actions.

## Phase 4: Parity closure and UI adaptations (2 to 4 days)

1. Identify any remaining desktop-coupled interactions.
2. Replace with web-safe equivalents where needed while preserving behavior goals.
3. Keep a temporary parity-gap list and close each item.

Likely adaptation areas:
- Native context menu UX parity in browser.
- OS-specific folder open affordances.
- Explicit omission of launch actions in browser UI while preserving desktop launch flows.

Deliverables:
- Browser and desktop feature parity accepted for Stage 2 scope.

## Phase 5: Validation and hardening (2 to 4 days)

1. Regression pass for desktop mode.
2. Browser functional pass.
3. Performance check on scan/filter/media workflows.
4. Logging and error UX review.
5. Packaging and runbook updates.

Deliverables:
- Stage 2 browser milestone candidate.
- Updated docs and operational notes.

## 6. UI Reuse Estimate

Estimated reuse for browser milestone:

1. Components and styling: 85 to 95 percent.
2. Hooks as currently written: 45 to 65 percent reusable without refactor.
3. Hooks after data-layer abstraction: 80 to 90 percent reusable.
4. Desktop-specific interaction surfaces needing adaptation: 10 to 20 percent.

Given confirmed parity target, this adaptation slice is expected but should end with equivalent behavior, not permanent feature removal.

## 7. Key Risks and Mitigations

1. Risk: Platform coupling in hooks causes broad refactor scope.
- Mitigation: Strict adapter boundary and phased hook migration.

2. Risk: Launch and file-system actions differ between desktop and browser contexts.
- Mitigation: Keep launch host-desktop-only and capability-gate launch UI/actions in browser/mobile clients.

3. Risk: Contract drift between desktop IPC and web API.
- Mitigation: Single source of truth types and adapter conformance tests.

4. Risk: Feature parity delays.
- Mitigation: Define milestone parity set and defer advanced parity to Stage 2.1.

5. Risk: Service lifecycle complexity (tray, close-to-background, restart behavior).
- Mitigation: Isolate lifecycle manager module and test startup/shutdown/reopen flows explicitly.

## 8. Definition of Done for Stage 2 Initial Milestone

All must be true:

1. Browser mode can:
- Load config
- Scan library
- Browse/filter views
- Edit metadata
- Manage media
- Use vault flows
- Use version notification workflows
- Omit launch controls/actions by design

2. Desktop mode remains fully functional.

2.1 Desktop launch/play flows remain fully functional on host machine.

3. Renderer feature hooks use GalleryClient abstraction, not direct window.gallery calls.

4. Desktop service lifecycle works as defined:
- Opening desktop UI starts or reconnects to running service.
- Closing desktop UI leaves service running in tray.
- Tray can reopen desktop UI.

5. Documentation includes:
- Run instructions for desktop and LAN browser modes
- Service lifecycle behavior and tray controls
- Web gallery-only behavior and host-only launch policy
- API capabilities/status endpoint usage notes for future mobile client
- Troubleshooting notes

## 9. Proposed First Sprint (Immediate Next Steps)

1. Create GalleryClient interface and service lifecycle capability model.
2. Implement Electron adapter and provider wiring.
3. Refactor first three hooks (lifecycle, game actions, media manager).
4. Scaffold tray lifecycle manager with reopen behavior.
5. Add API version, capabilities, and health/status contract stubs.
6. Verify desktop parity with current build and smoke tests.

If this sprint is successful, proceed to backend bootstrap in Phase 2.

## 10. Implementation Companion

- Detailed file-by-file execution checklist: stage2-phase1-checklist.md
