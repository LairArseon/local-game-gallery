# Stage 2.6 Plan: Version Storage Compression

[Back to Main README](../../README.md) | [Back to Docs Hub](../README.md)

## 1. Objective

Add a user-controlled storage mode for game versions so large libraries can save disk space without removing version visibility from the gallery.

Primary outcome:
- Users can compress a version from the game view context menu.
- Compressed versions remain visible in the version list.
- Playing a compressed game prompts a styled confirmation and decompresses the latest selected version before launch.
- Decompressed content remains available until the user manually compresses again.
- A floating status notification shows while compression is in progress.
- Compression/decompression/download-launch paths emit structured logs for traceability.

## 2. Scope Summary

In scope for Stage 2.6:
- Version-level compress action from version context menu.
- Version row state icon updates (compressed vs decompressed).
- Download behavior that reuses existing compression workflow.
- Play flow support for compressed latest version with confirm-and-decompress.
- Stable naming convention for persisted compressed payload.

Out of scope for Stage 2.6:
- Automatic background recompression.
- Multi-version batch compression.
- Deduplicated content storage across versions.

## 3. Storage Model

## 3.1 Chosen model

Keep the current folder structure:
- `<GameFolder>/<VersionFolder>/`

Inside each version folder, store compressed payload with a fixed name:
- `storage_compresion.<extension>`

This preserves current scanner assumptions (version as directory) while adding compressed state metadata and payload handling.

## 3.2 Compression file naming

Convention:
- `storage_compresion.<extension>`

Examples:
- `storage_compresion.zip`
- `storage_compresion.7z` (future option)

Stage 2.6 default recommendation:
- Use `zip` for parity with existing download/upload compression pipeline.

## 3.3 State definition

Each version can be in one of two states:
- Decompressed: playable files exist in the version folder.
- Compressed: playable files are removed from the version folder and represented by `storage_compresion.<extension>`.

## 4. User Flows

## 4.1 Compress version from game view

1. User opens a game detail view.
2. User right-clicks a version row.
3. Context menu shows a new action: Compress Version.
4. System compresses version content into `storage_compresion.<extension>`.
5. Non-runtime metadata files remain available (for version visibility and metadata reads).
6. Version row switches to compressed-state icon.

## 4.2 Download from version context menu

1. User right-clicks a version row and selects download.
2. If version is already compressed:
- Use existing `storage_compresion.<extension>` directly as download source.
- Apply current rename/save flow used today.
3. If version is not compressed:
- Compress first using current download pipeline behavior.
- Continue with current rename/save flow.

## 4.3 Play compressed game

1. User presses Play.
2. App resolves latest version indicated by metadata (`latestVersion` / nfo-driven logic).
3. If resolved version is compressed:
- Show confirmation dialog styled with current app modal/dialog patterns.
- On confirm, decompress into that version folder.
- Keep version decompressed after launch (no automatic recompress).
4. Version row switches to decompressed-state icon.

## 5. UI Requirements

## 5.1 Version row icons

Icon position:
- Right side of version row, in the current position used by version nfo indicator.

States:
- Compressed icon: version stored as compressed payload.
- Decompressed icon: version currently expanded/playable on disk.

Notes:
- Icon tooltip should explicitly state current storage state.
- Existing nfo signal should remain available through tooltip text or an alternative inline indicator if needed.

## 5.2 Confirmation dialog for decompression

Requirements:
- Trigger only when user attempts to play a compressed latest version.
- Must use current application visual style tokens/components.
- Must explain:
  - which version will be decompressed,
  - that decompressed files will remain until manual recompress.

## 5.3 Floating compression status notification

Requirements:
- Show a floating notification/toast, aligned with current upload/download status patterns, while a version is being compressed.
- Notification must include at least:
  - game name,
  - version name,
  - current phase label (for example: preparing, compressing, finalizing).
- Notification must dismiss on success and switch to an error state when compression fails.
- Notification should also be reused for play-triggered decompression where applicable for state consistency.

## 6. Backend and Contract Changes

## 6.1 Shared contracts

Add/extend types for:
- Version storage state (`compressed` | `decompressed`).
- Compression format/extension (`zip` initially).
- Compress version request/result.
- Decompress version request/result.

## 6.2 IPC / service surface

Add endpoints/handlers:
- `compress-version`
- `decompress-version`
- Optional `get-version-storage-state` if not included in scan payload

Ensure parity across desktop IPC and service HTTP adapter where applicable.

## 6.3 Scanner integration

Scan must detect per-version storage state by checking:
- Presence of `storage_compresion.<extension>`.
- Presence/absence of runtime files for decompressed state.

Scanner output should include storage state for each version to drive row icons and action availability.

## 6.4 Launch integration

Play flow should:
- Resolve target version as it does today.
- Gate launch with decompress-confirm flow if target version is compressed.
- Reuse safe extraction/path validation rules from existing archive import pipeline.

## 6.5 Logging integration

All new processes must integrate with existing logging pipeline so issues are easy to trace.

Minimum logging coverage:
- Compression requested (who/what version, source state).
- Compression completed (output archive path, size, elapsed time).
- Compression failed (error category, message, operation phase).
- Decompression requested (trigger source: manual or play-triggered).
- Decompression completed/failed.
- Download path decision (reused compressed file vs on-demand compression).

Guidelines:
- Use structured log payloads with consistent source names for renderer, main process, and service layers.
- Include operation correlation identifiers where feasible so one action can be tracked across layers.
- Ensure user-facing errors map to logged technical details.

## 7. Data Safety Rules

1. Never delete metadata files (`*.nfo`) during compression.
2. Prevent path traversal during compression/decompression file operations.
3. Use temp-file + atomic move strategy for archive creation where possible.
4. On failure, preserve existing playable files when possible and emit clear error messages.
5. Add structured logs for compress/decompress lifecycle and failures.

## 8. Implementation Phases

## Phase A: Contracts and scan state

1. Add storage state fields to shared types.
2. Extend scanner to detect `storage_compresion.<extension>`.
3. Surface state in renderer models.

## Phase B: Compression and decompression operations

1. Implement version compression command.
2. Implement version decompression command.
3. Add robust cleanup/error handling and structured logs.

## Phase C: UI integration

1. Add context-menu action for Compress Version.
2. Add compressed/decompressed icons in version row.
3. Add confirmation dialog before play-triggered decompression.
4. Add floating compression notification with progress phases and terminal states.

## Phase D: Download flow alignment

1. Update download action logic:
- compressed version -> direct file use,
- decompressed version -> compress then download.
2. Preserve existing naming/save behavior.

## Phase E: Validation and hardening

1. Verify scan and icon accuracy across toggles.
2. Verify play flow with both states.
3. Verify download behavior in both states.
4. Verify large-version compression/decompression and rollback on failure.
5. Verify log completeness and cross-layer traceability for success/failure paths.

## 9. Acceptance Criteria

1. User can compress a version from the version context menu in game view.
2. Compressed versions show compressed icon; decompressed versions show decompressed icon.
3. Download action behaves correctly for both states without regressions.
4. Playing a compressed latest version prompts confirmation, decompresses, and then launches.
5. Decompressed versions stay decompressed until manually recompressed.
6. Scanner and UI remain stable with existing version folder structure.
7. Floating compression status notification is visible during compression and resolves correctly on success/failure.
8. Compression/decompression/download-launch actions are fully traceable through structured logs.
