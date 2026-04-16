# Documentation Hub

This is the central index for project documentation.

## Docker Setup and Deployment (End User)

No host npm install is required for this Docker path.

Use [Docker Compose Service Guide](operations/docker-compose.md) as the single source of truth for:

- env setup
- service/web stack variants
- compose start/stop commands
- troubleshooting and image workflow

## Bare-Metal Runtime

Use [Bare-Metal Service and Local Stack](operations/baremetal-service.md) for:

- service-only runtime
- web tray host runtime
- standalone client runtime
- full local stack up/down and troubleshooting

## Overview

- [Project Overview](overview/project-overview.md)
- [Feature List](overview/feature-list.md)

## Architecture

- [Codebase Refactor Audit](architecture/codebase-refactor-audit.md)
- [Workspace Layout (Multi-App Scaffold)](architecture/workspace-layout.md)

## Plans

- [Stage 2 Browser Plan](plans/stage2-browser-plan.md)
- [Stage 2 Phase 1 Checklist](plans/stage2-phase1-checklist.md)
- [Stage 3 Mobile Plan](plans/stage3-mobile-plan.md)
- [Componentized Delivery Plan](plans/componentized-delivery-plan.md)

## Operations

- [Docker Compose Service Guide](operations/docker-compose.md)
- [Bare-Metal Service and Local Stack](operations/baremetal-service.md)
- [Component Bundle Matrix](operations/component-bundle-matrix.md)
- [Bundle Installer Runtime Payload Guardrail](operations/bundle-installer-runtime-payload.md)

## Notes

- Keep runtime/generated data outside docs and out of git where possible.
- Prefer runtime data mounts outside the repository root (see operations docs).
- Prefer updating existing docs in place and keeping this index current when adding new docs.
- App boundaries now include scaffold folders under apps, packages, and services for staged migration.
