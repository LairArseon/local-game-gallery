# Stage 3 Plan: Mobile Client (Android First)

[Back to Main README](../../README.md) | [Back to Docs Hub](../README.md)

## 1. Objective

Deliver an Android client that mirrors the gallery-management capabilities of the desktop app while using the Stage 2 host service as backend.

Primary outcomes:
- Native-feeling mobile UX for browsing, filtering, metadata, media, vault, and notifications.
- Same core data contracts as desktop/web through the shared service API.
- Launch actions remain host-desktop-only and are not exposed in mobile UI.

## 2. Scope and Constraints

## In scope (Stage 3 initial milestone)

- Android app as first mobile target.
- LAN/Tailscale access to Stage 2 host service.
- Gallery-management parity features:
  - Browse/search/filter/sort
  - Metadata editing
  - Media management and uploads
  - Vault visibility and PIN workflows
  - Version mismatch notifications and resolution actions
- Capability-aware UI (mobile hides unsupported launch actions).

## Out of scope (Stage 3 initial milestone)

- iOS app (can be planned for Stage 3.x).
- Public internet deployment.
- Separate mobile auth layer.
- Remote executable launch from mobile.

## 3. Dependencies from Stage 2

Stage 3 assumes Stage 2 has completed these backend elements:

1. Stable API versioning.
2. Capabilities endpoint.
3. Health/service-status endpoint.
4. Feature-complete gallery-management endpoints.
5. Clear error model and validation responses.

## 4. Mobile Architecture Direction

## 4.1 Client architecture

- Presentation layer: screens/components per feature domain.
- State layer: feature stores/view models aligned with service contracts.
- Data layer: typed API client with retry/error mapping.

## 4.2 Backend integration

- Consume Stage 2 service API directly.
- Use capabilities endpoint on startup to configure available UI actions.
- Enforce launch omission in mobile regardless of capability drift.

## 4.3 Suggested transport/features

- HTTP/JSON for standard operations.
- Multipart upload for media.
- Optional SSE/WebSocket for scan/status live updates.

## 5. Execution Plan

## Phase 0: Mobile foundation and tech choice (0.5 to 1 day)

1. Finalize Android stack (native Kotlin or cross-platform framework).
2. Define navigation map and screen inventory.
3. Confirm API contract compatibility with Stage 2.

Deliverable:
- Approved mobile architecture baseline.

## Phase 1: API client and capability bootstrap (2 to 3 days)

1. Implement typed API client from Stage 2 contracts.
2. Add service discovery/config for host URL.
3. Integrate health and capabilities checks at app startup.

Deliverable:
- Mobile app can connect and validate backend readiness.

## Phase 2: Read-focused gallery experience (3 to 5 days)

1. Implement home gallery list/grid and detail screen.
2. Add search/filter/sort flows.
3. Add vault visibility states and notifications panel read mode.

Deliverable:
- Functional gallery browsing and discovery on mobile.

## Phase 3: Edit and media workflows (3 to 6 days)

1. Metadata editing forms.
2. Tag and status editing.
3. Media uploads/reorder/remove flows.
4. Version mismatch resolve/dismiss actions.

Deliverable:
- Mobile supports full gallery-management writes.

## Phase 4: Vault and parity closure (2 to 4 days)

1. Vault PIN prompt and lock/unlock flows.
2. Missing-vault alerts and parity behavior checks.
3. Final parity audit against Stage 2 matrix.

Deliverable:
- Gallery-management parity accepted for Android client.

## Phase 5: Hardening and distribution prep (2 to 4 days)

1. Error and offline handling polish.
2. Performance pass for large libraries.
3. Logging/telemetry hooks (if desired).
4. Packaging/signing runbook draft.

Deliverable:
- Stage 3 Android release candidate.

## 6. API Readiness Requirements (to enforce now in Stage 2)

These should be implemented during Stage 2 to reduce mobile rework:

1. API version endpoint (example: /api/version).
2. Capabilities endpoint (example: /api/capabilities) including explicit launch support flag.
3. Health endpoint (example: /api/health) with service status metadata.
4. Uniform error envelope shape across endpoints.
5. Stable pagination/filter semantics where list size may grow.

## 7. Risks and Mitigations

1. Risk: Backend contract drift between web and mobile clients.
- Mitigation: Single shared schema and compatibility checks.

2. Risk: Mobile UX friction for dense desktop workflows.
- Mitigation: Mobile-first interaction redesign while preserving feature behavior.

3. Risk: Large media payload performance on mobile networks.
- Mitigation: Thumbnail strategies, lazy loading, and upload constraints.

4. Risk: Service reachability over LAN/Tailscale variability.
- Mitigation: Startup health checks, reconnect UX, and clear host configuration UI.

## 8. Definition of Done (Stage 3 Initial Milestone)

All must be true:

1. Android client supports gallery-management parity flows.
2. Launch actions are absent in mobile UI by design.
3. App works over LAN/Tailscale against Stage 2 service.
4. Capability/health/version endpoints are consumed at startup.
5. Documentation includes setup, host connection, and troubleshooting.

## 9. Handoff from Stage 2 to Stage 3

Before starting implementation, confirm:

1. Stage 2 DoD is complete.
2. Stage 2 backend contracts are frozen for Stage 3 kickoff.
3. Parity matrix exists and includes explicit launch exclusion for mobile/web.
