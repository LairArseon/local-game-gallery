# Stage 2.7 Phase 2: Level 2 Removable Add-On Plan

[Back to Main README](../../README.md) | [Back to Docs Hub](../README.md) | [Back to Stage 2.7 Plan](./stage2-7-modular-extension-foundation-plan.md)

## 1. Purpose

This document narrows Stage 2.7 Phase 2 to the level 2 target:

- modules are packaged separately from the base host registration path
- modules can be included or omitted from installed payloads
- the host can start and run when a module package is absent
- installer selection affects packaged module presence, not only config state

This is intentionally narrower than a full plugin system.
It does not require arbitrary third-party runtime installation yet.

## 2. Problem Statement

The current Stage 2.7 module model is still compile-time coupled.

Current blocking example:
- [apps/shared/app-shell/core/builtInModules.ts](../../apps/shared/app-shell/core/builtInModules.ts) imports [apps/f95-module/module.ts](../../apps/f95-module/module.ts) directly.

Implication:
- F95 is still a compiled-in dependency.
- Installer choices can only toggle config state.
- Removing the F95 source or omitting its compiled artifact would currently break registration unless the host import path changes first.

That means the current model is not a removable add-on model.

## 3. Level 2 Target

For Stage 2.7 Phase 2, level 2 means:

1. The host does not import F95 source directly.
2. The host discovers packaged modules through a manifest or generated availability record.
3. F95 can be present or absent in the packaged install payload.
4. If F95 is absent, the app still builds, starts, and runs normally.
5. If F95 is present, the host loads it through the same generic module contract already introduced for contributions and refresh hooks.

This is the acceptance boundary for this phase.

## 4. Non-Goals

This phase does not require:

1. Arbitrary user-installed third-party plugins.
2. Hot-loading modules after app startup.
3. Sandboxing untrusted code.
4. Independent module update delivery after installation.
5. Marketplace-style extension management.

Those belong to a later level if the architecture grows beyond packaged removable add-ons.

## 5. Required Outcomes

At the end of this phase, all of the following should be true:

1. Module registration is data-driven instead of hardcoded by direct source import.
2. The base host has a defined module discovery input.
3. The F95 module has a separate packaged output path.
4. Installer selection can include or omit the F95 packaged artifact.
5. Missing module artifacts are handled as a normal state rather than a startup failure.
6. Config state remains optional and subordinate to actual module availability.

## 6. Phase 2 Work Items

## 6.1 Define the module manifest contract

Add a host-readable manifest shape for packaged modules.

Minimum fields:
- `id`
- `displayName`
- `version`
- `entry`
- `hostApiVersion` or equivalent compatibility field
- `contributes`
- `installerComponentId` if packaging needs to map directly to installer sections

Rules:
- The manifest must be serializable and readable without importing module source.
- The manifest must be sufficient for discovery, validation, and load decisions.

Deliverable:
- A concrete manifest type and validation rules.

## 6.2 Define the packaged module layout

Choose one packaged directory shape for installed modules.

Example direction:
- `modules/f95/manifest.json`
- `modules/f95/index.js`
- `modules/f95/assets/*`

Rules:
- The host must not need the original `apps/f95-module` source tree at runtime.
- The packaged layout must work for desktop, service-backed web, and standalone desktop distributions.

Deliverable:
- One approved on-disk packaged module layout.

## 6.3 Replace direct host imports with a discovery/loader contract

Refactor the host so it no longer does this pattern:
- direct import of a specific module from app source
- direct registry construction from module source objects

Replace it with:
- discover available packaged modules
- validate manifest
- load entrypoint for valid modules only
- skip missing or invalid modules without crashing host startup

This is the architectural pivot point of the phase.

Deliverable:
- A loader path that allows zero-module startup.

## 6.4 Define module runtime states clearly

The host needs distinct meanings for:

1. `available`
- the host knows about a module package because it was discovered

2. `installed`
- the module package is present in the installed payload for this runtime

3. `enabled`
- the installed module is active in config and allowed to contribute UI/refresh behavior

Rules:
- `enabled` can never override `installed`
- persisted config for a missing module must not force host loading
- stale config for absent modules must be ignored safely

Deliverable:
- A documented state model used consistently by the host and installer

## 6.5 Define the module entrypoint interface

The entrypoint that the loader resolves must expose the host contract without requiring host-owned F95 knowledge.

Expected entry capabilities:
- contribution descriptors
- optional refresh handler
- optional default config state
- display metadata for setup/logging

Rules:
- The host consumes a generic interface only.
- Module-specific logic remains inside the module package.

Deliverable:
- One stable entrypoint interface for packaged modules.

## 6.6 Define compatibility validation and failure isolation

The host must handle these conditions safely:

1. manifest missing
2. manifest malformed
3. entry file missing
4. module compatibility mismatch
5. module load failure during registration

Required behavior:
- log the failure with module-specific source information
- skip the module
- continue app startup

Deliverable:
- A documented failure-handling policy and host behavior contract.

## 6.7 Define the build-time generation step

Because the repo currently builds from source under `apps`, the build pipeline needs an explicit packaging step that produces installable module artifacts.

This phase should define:
- how `apps/f95-module` becomes a packaged module output
- whether a generated module manifest index is emitted
- which build step owns module packaging for installer consumption

Deliverable:
- A concrete build-time path from source module to packaged artifact.

## 6.8 Define installer inclusion behavior

Installer behavior must change from config-only toggling to payload selection.

Required behavior:
- if `F95 Module` is selected, its packaged artifact is installed
- if `F95 Module` is not selected, its packaged artifact is omitted
- config seeding may still exist, but it is secondary to payload inclusion

Important rule:
- payload absence is what makes the add-on removable
- config alone is not sufficient for level 2

Deliverable:
- Installer packaging behavior tied to packaged module presence.

## 6.9 Define the host boot contract with zero modules present

This is the test that prevents the architecture from slipping back into compile-time coupling.

The host must be able to:
- discover no modules
- register an empty module set
- render setup, notifications, focus, detail, and metadata editor surfaces without module failures
- complete startup normally

Deliverable:
- Verified zero-module boot path.

## 7. Recommended Implementation Order Inside Phase 2

1. Define manifest schema and entrypoint interface.
2. Define packaged output layout.
3. Replace the hardcoded registry source import path with a loader contract.
4. Add compatibility validation and failure isolation.
5. Add build-time packaging for F95.
6. Update installer packaging to include or omit the packaged F95 artifact.
7. Validate startup with F95 present.
8. Validate startup with F95 absent.

This order keeps the host decoupling ahead of installer work.

## 8. Definition of Done

Phase 2 for level 2 is complete only if all of the following are true:

1. [apps/shared/app-shell/core/builtInModules.ts](../../apps/shared/app-shell/core/builtInModules.ts) no longer imports [apps/f95-module/module.ts](../../apps/f95-module/module.ts) directly.
2. Module registration is driven by packaged module discovery rather than source imports.
3. The F95 module has a discrete packaged output.
4. The installer can omit that packaged output when `F95 Module` is unchecked.
5. The app builds and starts successfully when the F95 packaged output is absent.
6. Stale F95 config does not break startup or force module activation when the module package is absent.

## 9. Immediate Next Step

The first implementation task for this phase should be:

1. remove the unconditional F95 import from the host registration path
2. replace it with a manifest-driven or generated-availability loader contract

Until that happens, the system is still a compiled-in feature model rather than a removable add-on model.