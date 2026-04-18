# Componentized Delivery Plan

[Back to Main README](../../README.md) | [Back to Docs Hub](../README.md)

Goal: deliver fully separate components that can be installed independently or together.

## Target components

1. Service
- Headless backend API.
- Supports Docker and baremetal install.

2. Web Client
- Browser UI.
- Uses service API only.

3. Desktop Client
- Desktop UI-only executable.
- Uses service API only.
- Enables host-local features only when backend/device policy allows.

4. Bundle Installer (later)
- Lets users choose Service and/or Web Client and/or Desktop Client.

## Feasibility

This is feasible with the current architecture because service capabilities and version endpoints already exist.

## Milestones

## M1 (in progress)

- Workspace separation:
  - full desktop app under apps/full-desktop
  - standalone desktop client under apps/standalone-client
  - package/service boundaries under packages and services
- Standalone desktop executable pipeline:
  - dev runner
  - build artifacts
  - windows packaging target

- Web client boundary and deployment target:
  - dedicated web app under apps/web-client
  - docker web image builds from apps/web-client
  - dedicated web build output under dist-web-client

## M2

- Bundle installer planning artifacts:
  - component manifest scaffold
  - build/distribution matrix scaffold
  - component selection policy and constraints
  - tracked in docs/operations/component-manifest.json and docs/operations/component-build-matrix.json

## M3

- Bundle installer with component selection:
  - Service
  - Web Client
  - Desktop Client
- Component-aware install/uninstall and update behavior.

## Deferred track

- Service-only baremetal installer automation.
- Service auto-start bootstrap scripts.
- Dedicated service installer packaging.

## Compatibility contract policy

Clients must validate on connect:

1. api/version
2. api/capabilities
3. api/health

Reject incompatible backends with actionable error details.

## Packaging outputs (target state)

1. Full desktop suite installer
2. Desktop client-only installer
3. Optional web-client package
4. Bundle installer (component-selectable)
5. Service-only installer (deferred)
