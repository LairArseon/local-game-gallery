# Stage 2.5 Plan: Game Archive Upload and Import

[Back to Main README](../../README.md) | [Back to Docs Hub](../README.md)

## 1. Objective

Add an upload/import flow that lets users import a compressed game archive directly from the UI, creating or extending game folders in the gallery.

Primary outcome:
- New topbar action (upload icon) opens an import modal.
- User provides Game Name, Game Version, and archive file.
- Import process creates game folder and version folder, then extracts files.

## 2. User Flows

## 2.1 New game import

1. Click upload icon in topbar.
2. Modal opens with empty Game Name and Game Version.
3. User selects archive (browse or drag-and-drop).
4. User confirms import.
5. System creates:
   - `<gamesRoot>/<Game Name>/`
   - `<gamesRoot>/<Game Name>/<Game Version>/`
6. Archive content is extracted into version folder.

## 2.2 Add version to existing game (future reuse, enabled by same modal)

1. Modal opens from an existing game context.
2. Game Name is prefilled (read-only or locked by context).
3. User only sets version and archive.
4. New version folder is created under existing game.

## 3. Modal Requirements

Minimum visible fields:
- Game Name (text)
- Game Version (text)
- Archive upload field

Upload field behavior:
- Click to browse archive file.
- Drag-and-drop archive onto field.
- Show success indicator/icon when archive is staged.
- Staged file is temporary.
- If user cancels modal, staged file is deleted.

Advanced section:
- Collapsible, collapsed by default.
- Contains metadata fields equivalent to current metadata editor.

## 4. Archive Extraction Rules

Supported input patterns:

1. Direct-file layout (expected)
- Archive root directly contains game files.
- Extract all archive root entries into `<Game Version>` folder.

2. Single-wrapper-folder layout (common)
- Archive root contains exactly one top-level directory and no sibling files/directories.
- Extract contents of that single directory into `<Game Version>` folder (strip one wrapper level).

3. Multi-root layout
- Archive root contains multiple entries.
- Extract as-is into `<Game Version>` folder.

Conflict/overwrite policy (initial):
- If target version folder exists, require explicit confirmation before overwrite or reject with clear message.

## 5. Temporary File Lifecycle

1. On file select/drop:
- Stage archive in temp storage.

2. On successful import:
- Delete staged temp archive.

3. On cancel:
- Delete staged temp archive.

4. On failure:
- Delete staged temp archive and surface actionable error.

## 6. Step-by-Step Implementation Plan

## Phase A: Contracts and transport

1. Add shared payload/result types for import archive operation.
2. Add Gallery API method for archive import.
3. Wire Electron preload and main IPC handler.
4. Add HTTP service endpoint parity for web client mode.

## Phase B: Backend import pipeline

1. Validate Game Name and Game Version.
2. Validate archive type and existence.
3. Create target game/version folders.
4. Extract archive using wrapper-folder detection rules.
5. Persist optional metadata when provided.
6. Trigger targeted scan refresh for imported game.
7. Clean temporary staged files in all code paths.

## Phase C: UI integration

1. Add topbar upload icon action.
2. Build upload modal with required fields and dropzone.
3. Add staged-file visual success state.
4. Add collapsible advanced metadata section.
5. Add progress and status feedback (staging, extracting, finalizing).

## Phase D: Reuse mode for existing game

1. Add modal open mode with prefilled Game Name.
2. Reuse same import pipeline for adding versions.

## Phase E: Validation and hardening

1. Test direct-file and single-wrapper-folder archives.
2. Test cancel path (temp cleanup).
3. Test failed extraction path (temp cleanup + clear errors).
4. Test same-name version collision behavior.
5. Verify imported game/version appears without full blocking rescan.

## 7. Acceptance Criteria

1. User can import a new game archive from topbar modal.
2. Single-wrapper-folder archives import correctly without extra nesting.
3. Temp staged files are deleted on success, cancel, and failure.
4. Modal advanced section supports metadata fields and stays collapsed by default.
5. Flow can be reused to add version to an existing game with prefilled name.
