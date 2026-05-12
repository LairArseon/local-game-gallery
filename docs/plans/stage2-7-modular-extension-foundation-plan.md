# Stage 2.7 Plan: Modular Feature Foundation and F95 First Module

[Back to Main README](../../README.md) | [Back to Docs Hub](../README.md)

## 1. Objective

Introduce a modular feature foundation for built-in, selectively shippable modules, starting with an F95 module, while minimizing churn to current runtime flows and keeping future Steam, Itch.io, and GOG modules viable.

Primary outcomes:
- Built-in modules can be shipped alongside the app and selectively enabled.
- Module-specific code lives under apps in module-owned folders.
- Per-game module data can be stored in game NFO custom tags.
- Module-level state can be stored in app config in a namespaced way.
- The notification center evolves from version-mismatch-only to a generic notification feed.
- Shared UI surfaces gain extension points for setup, notifications, focused game view, and detail view.
- Initial scope targets the service-backed architecture first, because it covers web client, standalone desktop client, and Docker-backed web flow with a single backend model.

Implementation status as of 2026-05-12:
- Stage 2.7 core delivery is now implemented end-to-end for the first built-in module pass.
- The F95 module ships from [apps/f95-module](../../apps/f95-module), persists app-level state under `config.modules.f95`, and stores per-game state in namespaced `module_f95_*` custom tags.
- The notification center is now a generic Notification Hub fed by version mismatches, vault alerts, and module-authored items.
- F95 notifications are now persistent-condition entries derived from game metadata, with dismissal markers stored per game so later updates can reappear cleanly.
- The setup panel, metadata editor, focused game view, and detail panel all have working module-owned contribution seams exercised by F95.
- The bundle installer now exposes `F95 Module` as an optional install-time section and seeds `modules.f95.enabled = true` into the relevant runtime config when selected.
- F95 setup timestamps are formatted for human-readable local display rather than raw datetime strings.

Validation snapshot as of 2026-05-12:
- `npm run up:baremetal` succeeds after the Stage 2.7 app-side changes.
- `npm run dist:bundle-installer:win` succeeds after the F95 installer-section NSIS fixes.
- The remaining known runtime warning during baremetal startup is the pre-existing Electron `fs.Stats constructor is deprecated` warning.

## 2. Confirmed Decisions Before Implementation

These decisions are locked for Stage 2.7 initial rollout unless explicitly changed later.

1. Module model:
- Modules are built-in features shipped with the app.
- Modules are selectively enabled rather than dynamically discovered at runtime.
- A future refactor toward discoverable extensions remains possible and should be kept in mind.

2. First module:
- The first module is F95.
- All F95-specific code must live in an F95 module folder under apps.

3. Initial scope target:
- Prioritize the service-backed stack first.
- This means the initial target is the service plus web-client model, which also benefits the standalone client and Docker-backed web flow.
- Full desktop IPC parity may be deferred until the module seams stabilize.

4. Per-game F95 data storage:
- F95 game identity can be stored in game NFO custom tags.
- F95 update state derived from RSS can also be stored in game NFO custom tags.

5. Module config storage:
- Modules need a mechanism to store module-owned state in app config.
- F95 needs at least a last-sync checkpoint and related module state in config.

6. UI ownership:
- Reading and rendering module-owned metadata in the UI must be isolated to the module.
- Base app shell should provide slots and contracts, not F95-specific logic.

7. Notifications:
- Current notification center behavior must be preserved.
- The notification center must evolve into a generic notification feed with multiple sources.

8. Future extensibility:
- The solution should favor future modules such as Steam, Itch.io, and GOG.
- Base contracts should be generic and namespaced.

## 3. Why This Stage Starts With the Types Fix

There is a duplicated types layer today:
- [apps/shared/app-shell/types.ts](apps/shared/app-shell/types.ts)
- [apps/full-desktop/src/types.ts](apps/full-desktop/src/types.ts)
- [apps/web-client/src/types.ts](apps/web-client/src/types.ts)

This duplication increases the cost and risk of any module, config, notification, or contract work.

However, there is a constraint:
- [apps/full-desktop/electron/tsconfig.json](apps/full-desktop/electron/tsconfig.json) still relies on an app-local types boundary.
- Importing shared renderer source directly into the Electron project risks the known rootDir and TS6059-style problems already observed during workspace migration.

Therefore the first step is not a total type unification. The practical first step is a staged reduction of duplication:
- Make shared renderer contracts converge on [apps/shared/app-shell/types.ts](apps/shared/app-shell/types.ts).
- Remove the independent web-client duplication.
- Keep [apps/full-desktop/src/types.ts](apps/full-desktop/src/types.ts) as the Electron-safe app-local facade for now.
- Revisit a proper shared contracts package only after the module seams are in place.

## 4. Current Architecture Constraints

## 4.1 Delivery/runtime modes

The repo currently supports three delivery approaches:
1. Service plus web client or service plus client model.
2. Full desktop app build that integrates service and client.
3. Docker build that integrates service plus web client.

Important architectural reality:
- The standalone client is effectively a shell over the web-client renderer.
- The shared app shell already exists and is increasingly reused.
- The full desktop suite still carries a separate IPC surface in addition to the service-backed HTTP surface.

Relevant files:
- [apps/standalone-client/src/App.tsx](apps/standalone-client/src/App.tsx)
- [apps/shared/app-shell/client/contracts.ts](apps/shared/app-shell/client/contracts.ts)
- [apps/full-desktop/electron/main.ts](apps/full-desktop/electron/main.ts#L408)
- [apps/full-desktop/electron/service.ts](apps/full-desktop/electron/service.ts)

Implication:
- Service-backed module work has a better initial return on effort because it spans multiple deliveries with one backend model.
- Full desktop parity should be treated as an explicit follow-up concern unless requested earlier.

## 4.2 Metadata model

Per-game custom metadata already exists through custom tags in game NFO handling.

Relevant file:
- [apps/full-desktop/electron/game-library.ts](apps/full-desktop/electron/game-library.ts)

Implication:
- F95 per-game id and F95 update-derived fields can use namespaced custom tags immediately.
- This avoids creating a new per-game storage mechanism in the first iteration.

## 4.3 Config model

The config model is fixed-shape and not currently extension-oriented.

Relevant files:
- [apps/shared/app-shell/types.ts](apps/shared/app-shell/types.ts)
- [apps/full-desktop/electron/config.ts](apps/full-desktop/electron/config.ts)

Implication:
- A generic module-config namespace must be added before module-owned state can be handled cleanly.

## 4.4 Notification model

The current notification center is specifically implemented around version mismatches and vault alerts.

Relevant files:
- [apps/shared/app-shell/hooks/useVersionMismatchManager.ts](apps/shared/app-shell/hooks/useVersionMismatchManager.ts)
- [apps/shared/app-shell/components/VersionMismatchPanel.tsx](apps/shared/app-shell/components/VersionMismatchPanel.tsx)
- [apps/full-desktop/src/App.tsx](apps/full-desktop/src/App.tsx#L653)
- [apps/web-client/src/App.tsx](apps/web-client/src/App.tsx#L764)

Implication:
- A generic notification feed contract is required before multi-source module notifications can fit cleanly.

## 4.5 UI extension seams

The app already has some useful extension seams:
- Setup panel can be refactored to accept contribution sections.
- Library/detail surface already uses render callbacks.
- Focus and detail regions can host additional module-owned blocks.

Relevant files:
- [apps/shared/app-shell/components/SetupPanel.tsx](apps/shared/app-shell/components/SetupPanel.tsx)
- [apps/shared/app-shell/components/LibraryPanel.tsx](apps/shared/app-shell/components/LibraryPanel.tsx)
- [apps/shared/app-shell/components/TopbarPanels.tsx](apps/shared/app-shell/components/TopbarPanels.tsx)

Implication:
- We should extend those seams instead of forking large app surfaces.

## 5. Stage Goals

## 5.1 Immediate goals

1. Reduce types duplication enough to lower the cost of future work.
2. Establish a built-in module host contract.
3. Add namespaced module state to app config.
4. Generalize the notification center to a feed.
5. Create shared UI contribution points.
6. Implement F95 as the first built-in module on top of those seams.

## 5.2 Explicit non-goals for the first module pass

1. No runtime discovery or hot-loading of third-party modules.
2. No full generic plugin sandboxing system.
3. No complete cross-runtime parity guarantee on day one for the full desktop IPC path unless explicitly prioritized.
4. No separate per-game module database in the first iteration.
5. No public internet deployment model changes.

## 6. Proposed Module Architecture

## 6.1 High-level model

Each built-in module should provide:
- Identity:
  - module id
  - display name
  - version or build metadata if needed later
- Enablement:
  - installed
  - enabled
- Config:
  - defaults
  - validation
  - persistence namespace
- Backend hooks:
  - sync or refresh operations
  - mapping external data to internal game metadata
  - notification contribution generation
- UI contribution hooks:
  - setup panel section
  - notification feed items
  - focused game view blocks
  - detail page blocks
  - future card badges or filter integrations if needed

## 6.2 Folder placement

Base module host infrastructure should live in a shared area suitable for both app shell and service-backed runtime cooperation.

F95-specific code should live in an apps-owned module folder, for example:
- apps/f95-module

Exact final folder structure should be confirmed before implementation.

## 6.3 Contract philosophy

The host should know only generic module concepts:
- config block
- sync trigger
- notification items
- UI contributions
- game metadata helpers

The host should not know F95-specific field names, RSS parsing details, or presentation copy beyond generic extension contracts.

## 7. Data Model Strategy

## 7.1 Per-game module metadata in NFO

Initial approach:
- Store F95 game id in a custom NFO tag.
- Store F95 update-derived state in custom NFO tags as needed.

Proposed naming direction:
- custom:module_f95_id
- custom:module_f95_last_update_at
- custom:module_f95_last_update_title
- custom:module_f95_last_feed_item_id

Exact names must be confirmed before implementation.

Why namespaced tags:
- Avoid collisions with future modules.
- Keep per-game extension state portable with the game folder.
- Preserve simple migration path to future modules.

Concern to revisit during implementation:
- Whether names should use module_f95_x style, f95_x style, or another stable namespace convention.

Question to ask when we reach it:
- Do you want a strictly generic module namespace naming convention for NFO custom tags across all future modules, or a shorter per-module prefix convention?

## 7.2 Module state in app config

Add a namespaced module state area to config.

Initial capability needed:
- Module enabled flag
- Module-specific settings
- Last successful sync checkpoint
- Last processed RSS item id or timestamp
- Last error or sync status if diagnostics are desired

Why config, not NFO:
- These are app-level or sync-level concerns rather than per-game authoring fields.
- They should not be duplicated into every game NFO.

Concern to revisit during implementation:
- Whether config should store only sync checkpoint state or also module installation and enabled state.

Question to ask when we reach it:
- Should installer selection only decide initial enabled state, or should users also be able to toggle module enablement later from setup UI?

## 8. Notification Center Refactor

## 8.1 Current limitation

The current notification center is version-mismatch specific.

Relevant files:
- [apps/shared/app-shell/components/VersionMismatchPanel.tsx](apps/shared/app-shell/components/VersionMismatchPanel.tsx)
- [apps/shared/app-shell/hooks/useVersionMismatchManager.ts](apps/shared/app-shell/hooks/useVersionMismatchManager.ts)

## 8.2 Target model

Replace the current specialized model with a generic notification feed.

The feed should support:
- source id
- notification id
- type
- title
- summary or body
- createdAt
- related game path if applicable
- severity or category if useful
- actions
- dismissibility
- source-owned metadata

Preserve current sources:
- Version mismatch notifications
- Vault alerts

Add future sources:
- F95 updates
- Future Steam/Itch/GOG module notifications
- Other internal host alerts if needed

## 8.3 UI behavior goals

The notification center should:
- Preserve current topbar entry point
- Preserve current version mismatch workflows
- Support multiple sections or grouped feed items
- Support open-game action when a game is related
- Support source-specific actions such as resolve, dismiss, or open external item later if desired

Concern to revisit during implementation:
- Whether the new center should render grouped-by-source sections or a flat time-ordered feed with source labels.

Question to ask when we reach it:
- Do you want notifications visually grouped by source, or a unified chronological feed with source badges?

## 9. Setup Panel Contribution Model

The setup panel in [apps/shared/app-shell/components/SetupPanel.tsx](apps/shared/app-shell/components/SetupPanel.tsx) should evolve to support module-owned sections.

Base host should provide:
- A standard section mount point
- Access to module config state
- Access to module actions such as refresh now
- Common disabled/loading affordances

F95 setup section likely needs:
- Enabled state
- Feed URL or feed selection input if configurable
- Last sync time
- Last processed checkpoint summary
- Refresh action
- Error diagnostics if available

Concern to revisit during implementation:
- Whether module sections belong inline in the main setup form or in their own collapsible area.

Question to ask when we reach it:
- Do you want module settings inline with core setup, or separated under a distinct Modules section?

## 10. Game Surface Contribution Model

## 10.1 Focused game view

The focused game area should be able to display module-owned blocks.

Example F95 contribution:
- F95 thread id
- Latest known F95 update summary
- Possibly a later open-thread action

## 10.2 Detail page

The detail view should accept module-owned detail sections.

Example F95 contribution:
- F95 metadata block
- Latest update summary
- Change status derived from RSS
- Future actions if needed

Relevant file:
- [apps/shared/app-shell/components/LibraryPanel.tsx](apps/shared/app-shell/components/LibraryPanel.tsx)

Concern to revisit during implementation:
- Whether modules contribute raw React nodes through a registry or through structured descriptors rendered by host wrappers.

Question to ask when we reach it:
- Do you prefer host-owned layout with structured module contributions, or more direct module-rendered UI blocks with fewer host constraints?

## 11. F95 Module Scope

## 11.1 Backend responsibilities

The F95 module should:
- Read F95 per-game identifiers from NFO custom tags
- Fetch and parse RSS feed data
- Perform incremental sync from a stored checkpoint
- Match feed entries to games by F95 id
- Update NFO custom tags with derived F95 state
- Emit notification items into the shared feed model

## 11.2 UI responsibilities

The F95 module should:
- Read and display F95 NFO-derived fields
- Contribute setup UI
- Contribute notification items
- Contribute focused/detail view sections

## 11.3 Storage responsibilities

Per-game:
- F95 id
- F95 update-derived fields in custom tags

App-level:
- Last sync timestamp
- Last processed RSS checkpoint
- Enabled state and related module config

Concern to revisit during implementation:
- RSS feeds may not always provide perfect stable identifiers for incremental sync.

Question to ask when we reach it:
- Should F95 incremental sync use publication date only, or do you want a stricter item-id plus date checkpoint if available?

## 12. Installer Integration

The installer already has a selectable component model.

Relevant files:
- [docs/operations/component-manifest.json](docs/operations/component-manifest.json)
- [scripts/build-bundle-installer.mjs](scripts/build-bundle-installer.mjs)

Modules should eventually be selectable in a similar way:
- Installed or not installed
- Enabled by default or disabled by default based on installer selection

For the first pass:
- Module files may simply be shipped and toggled by config if that is materially simpler.
- Installer-level selection can then become a second step if packaging changes prove more complex than the module core.

Concern to revisit during implementation:
- Whether module selection should physically omit files from installed payload or just set initial enablement state.

Question to ask when we reach it:
- Do you want installer selection to actually change payload contents, or is initial enable/disable state sufficient for the first release?

## 13. Recommended Execution Order

## Phase 0: Documentation and contract freeze

1. Record the decisions in this plan.
2. Lock initial service-backed scope.
3. Lock naming strategy for module config and NFO tags.
4. Lock first-pass installer behavior expectations.

Deliverable:
- Approved Stage 2.7 scope baseline.

## Phase 1: Types-layer reduction

1. Converge shared renderer contracts on [apps/shared/app-shell/types.ts](apps/shared/app-shell/types.ts).
2. Remove web-client independent duplication by re-exporting or directly consuming shared app-shell contracts.
3. Keep [apps/full-desktop/src/types.ts](apps/full-desktop/src/types.ts) as the Electron-safe facade for now.
4. Define rules for where new cross-runtime types must be added first.

Deliverable:
- Reduced duplication for future module work.

Concern:
- Direct Electron import of shared renderer source must be avoided until the tsconfig boundary is intentionally reworked.

Question to ask when we reach it:
- Do you want to stop after the safe partial dedup step, or do you want to also schedule the larger shared-contracts package refactor immediately after?

## Phase 2: Module host contracts

1. Define built-in module registry types.
2. Define module config namespace shape.
3. Define notification feed item contract.
4. Define setup/detail/focus contribution contracts.
5. Define module service interaction contract where needed.

Checkpoint note as of 2026-05-12:
- The initial boolean `contributionSlots` direction was replaced with descriptor-based `contributes` entries keyed by open-ended slot ids such as `setup.section` and `game.detail.panel`.
- Work paused after updating the shared host types, module registry normalization, and the F95 scaffold to use this extensible descriptor model.
- The next continuation point is wiring these contribution descriptors into the shared notification feed and UI extension seams.

Deliverable:
- Generic host foundation with no F95-specific assumptions.

## Phase 3: Notification feed refactor

1. Replace version-mismatch-specific notification model with feed model.
2. Port current version mismatch and vault notifications into feed sources.
3. Keep current UX parity where possible.
4. Expose module contribution path.

Deliverable:
- Generic notification center with preserved current functionality.

Checkpoint note as of 2026-05-12:
- The topbar notification surface is now functionally a generic Notification Hub rather than a version-mismatch-only panel.
- Both desktop and web shells merge vault alerts, version mismatch notifications, and module-authored notifications into one shared feed model.
- The shared notification action contract now supports source-specific behavior in real usage: version mismatches still resolve or dismiss, while F95 update notifications open the linked thread URL and can be dismissed independently.
- F95 thread opening is now module-configurable through module state via `openLinksInIncognito`; desktop mode attempts a private/incognito browser window first and falls back to a normal external open if needed.
- Remaining Stage 2.7 notification work is now polish-oriented: richer grouping/history, broader module adoption beyond F95, and any follow-up UX refinements for action discoverability.

## Phase 4: Setup and game-view contribution seams

1. Add module section support to setup panel.
2. Add focused view contribution slots.
3. Add detail page contribution slots.
4. Keep layout host-owned where possible to maintain consistency.

Deliverable:
- Shared UI surfaces ready for module contributions.

Checkpoint note as of 2026-05-12:
- The shared host now resolves built-in modules into real setup and detail seams, and the F95 scaffold is visible through those host-owned surfaces.
- Work paused here for a UI polish stop because the first setup rendering looked visually out of place in the sidebar.
- This stop also captures a logging follow-up: modules should use source strings in the `module:<moduleId>` form so the log viewer can filter by module and sort entries by timestamp.
- The host render contract now passes module config state and game context into contribution renderers, which lets module-owned UI manage real setup inputs and detail summaries without moving F95 logic into the shell.
- The F95 module now owns its first real setup and detail renderers: setup can edit feed/checkpoint state inside the module config namespace, and detail can summarize namespaced `module_f95_*` tags instead of falling back to a generic raw-tag dump.
- The metadata editor now has a module-owned section seam backed by custom-tag draft editing, so F95 per-game identifiers can be edited inside the metadata modal instead of living in generic raw-tag fields.
- The focused/open game view now renders module-owned focus panels, and the F95 module uses that seam to surface linked thread and last-known update fields directly in the focus card.
- Initial F95 RSS parser helpers now exist against the real games feed structure, covering item title parsing, thread id extraction, creator/pubDate fields, guid/link handling, and preview image extraction from the description HTML.
- The next continuation point has shifted from UI shell work to backend behavior: use the new parser helpers in a real sync path, populate/update the F95 tags from feed results, emit module-authored notifications/logs, and finish the remaining notification genericization.

## Phase 5: Config extension support

1. Add namespaced module state to config types.
2. Extend config persistence and normalization.
3. Add module enablement and checkpoint support.
4. Expose this through service-backed APIs.

Deliverable:
- Stable config home for module state.

## Phase 6: F95 module backend

1. Create the F95 module folder under apps.
2. Implement NFO tag helpers.
3. Implement RSS fetch and parse flow.
4. Implement incremental sync checkpoint handling.
5. Emit notification feed items.
6. Update module-owned NFO tags.

Deliverable:
- Working F95 sync pipeline.

## Phase 7: F95 module UI

1. Add setup section.
2. Add notification feed source rendering.
3. Add focused-game block.
4. Add detail-page block.
5. Keep all F95-specific rendering inside the module.

Deliverable:
- End-to-end F95 module experience.

## Phase 8: Installer selection follow-up

1. Decide whether selection changes payload or only config defaults.
2. Integrate module selection into installer flow if desired.
3. Document selection behavior.

Deliverable:
- Optional installer-level module selection support.

Checkpoint note as of 2026-05-12:
- The bundle installer now includes an optional `F95 Module` section.
- Selecting that section does not change packaged payload contents; it seeds the target runtime config so `modules.f95.enabled` starts enabled for the selected install profile.
- Service-backed installs seed `$APPDATA\Local Game Gallery Service Tray\config.json`, and desktop installs seed `$APPDATA\Local Game Gallery Client\config.json`.
- The NSIS generation path was validated by a clean `npm run dist:bundle-installer:win` run after fixing PowerShell quoting, literal `$` escaping, and newline escaping in the generated seed script.

## 14. Definition of Done for Initial F95 Module Milestone

All must be true:

1. Shared renderer types duplication is reduced enough that web-client no longer carries its own full copy of shared app-shell contracts.
2. Module config namespace exists and persists safely.
3. Notification center is a generic feed while preserving current version mismatch and vault workflows.
4. Setup panel can host module-owned sections.
5. Focused and detail views can host module-owned sections.
6. F95 module code lives in its own module-owned folder under apps.
7. F95 game id and update state are stored in game NFO custom tags.
8. F95 sync state checkpoint is stored in config.
9. F95 updates can generate feed entries.
10. Base app shell does not contain F95-specific business logic beyond generic module-host seams.

## 15. Risks and Mitigations

1. Risk: Type contract drift remains across shared app shell and full-desktop local facade.
- Mitigation: Establish one canonical shared renderer contract and require app-local facade updates in the same patch.

2. Risk: Electron tsconfig boundary blocks full dedup too early.
- Mitigation: Use staged dedup first and postpone the full shared-contracts package until needed.

3. Risk: Notification center refactor causes regressions in existing version mismatch or vault flows.
- Mitigation: Port current sources into the new feed model before adding F95.

4. Risk: Module UI seams become too F95-specific.
- Mitigation: Keep host contracts generic and namespaced, and review every new seam against future Steam/Itch/GOG use.

5. Risk: RSS feed shape or item identity is unstable.
- Mitigation: Treat checkpoint strategy as an explicit implementation decision and confirm it before coding.

6. Risk: Installer selection scope grows faster than module foundation work.
- Mitigation: Treat installer payload-level module selection as a follow-up if needed, not as a blocker to core module architecture.

7. Risk: Full desktop IPC parity expands scope unexpectedly.
- Mitigation: Keep service-backed scope primary unless explicitly elevated.

## 16. Questions to Ask During Development

These must be asked at implementation time when the corresponding concern is reached.

1. NFO naming convention:
- Do you want a single strict namespaced convention for all module-owned custom tags, and which exact naming style do you prefer?

2. Module enablement behavior:
- Should installer selection only set the initial enabled state, or should users be able to enable and disable modules later in setup?

3. Notification feed layout:
- Should the notification center group items by source, or render a unified chronological feed with source labels?

4. Setup panel organization:
- Should module settings appear inline with base settings, or under a dedicated Modules section?

5. UI contribution ownership:
- Do you want host-owned layout with structured contribution descriptors, or do you prefer freer module-rendered blocks?

6. RSS checkpoint strategy:
- Should F95 incremental sync use timestamp only, or a stricter item-id plus timestamp checkpoint if feed data allows it?

7. Installer packaging behavior:
- Do you want module selection to change installed payload contents, or is config-based enablement enough for the first release?

8. Full desktop parity timing:
- Should full desktop IPC support be implemented during the first module milestone, or deferred until the service-backed module path is stable?

9. Shared contracts future:
- After the safe partial types dedup, do you want to schedule the larger shared-contracts package refactor immediately, or defer it until a second module appears?

## 17. Suggested Immediate Next Step

The first practical task is the safe types-layer reduction:
1. Make [apps/shared/app-shell/types.ts](apps/shared/app-shell/types.ts) the canonical shared renderer contract.
2. Remove the independent web-client duplication.
3. Keep [apps/full-desktop/src/types.ts](apps/full-desktop/src/types.ts) as the Electron-safe facade.
4. Only after that begin defining module host contracts.

This sequencing lowers friction for all later module, notification, and config work without prematurely breaking the Electron build boundary.