# Local Game Gallery - Feature List

[Back to Main README](../../README.md) | [Back to Docs Hub](../README.md)

This file tracks future ideas and planned improvements.

## How to use this list

- Add one section per feature.
- Keep scope clear and implementation-neutral when possible.
- Update `Status` as work progresses.

Status options:

- `idea`
- `planned`
- `in-progress`
- `done`
- `dropped`

---

## Feature Index

- [1. App Vault (Password-Protected Hidden Games)](#1-app-vault-password-protected-hidden-games) - `done`
- [2. In-App App Icon Customization (Drop PNG)](#2-in-app-app-icon-customization-drop-png) - `done`
- [3. New Version Notifications and Mismatch Badges](#3-new-version-notifications-and-mismatch-badges) - `done`
- [4. Quick Folder Navigation from Game and Version Menus](#4-quick-folder-navigation-from-game-and-version-menus) - `done`
- [5. Filter Pane Redesign (Tag Bubbles + Condensed Layout)](#5-filter-pane-redesign-tag-bubbles--condensed-layout) - `done`
- [6. Top Bar Action Prioritization + F5 Rescan Shortcut](#6-top-bar-action-prioritization--f5-rescan-shortcut) - `done`
- [7. Consistent Open/Play Actions in Focused Views](#7-consistent-openplay-actions-in-focused-views) - `done`
- [8. Adjustable Text and Padding Scaling Across Views](#8-adjustable-text-and-padding-scaling-across-views) - `done`
- [9. Action Label Wording Refresh (Top Bar + Game Actions)](#9-action-label-wording-refresh-top-bar--game-actions) - `done`

---

## 1. App Vault (Password-Protected Hidden Games)

- Status: `done`
- Priority: `high`
- Goal: Allow users to hide selected games behind a vault that requires a password to access.

### Work note

- Completed on 2026-04-12.

### Summary

Add a vault mode where specific games are not visible in normal browsing/search/filter views. These games only appear after the user unlocks the vault.

### Core behavior

- Users can mark/unmark games as `vaulted`.
- Vaulted games are hidden by default across all views and filters.
- A vault unlock action prompts for password.
- Once unlocked, vaulted games become visible until the app is locked again.
- Users can manually lock the vault at any time.

### Security expectations (initial)

- Store a password hash (never plain text).
- Use a modern password hashing algorithm (for example: Argon2 or bcrypt).
- Validate password locally.
- Keep implementation practical for an offline desktop app.

### UX notes

- Add a clear lock/unlock indicator in top bar.
- Provide context-menu action: "Move to vault" / "Remove from vault".
- Show a subtle badge for vaulted games when vault is unlocked.

### Open questions

- Should vault auto-lock after inactivity?
- Should launch be blocked while locked for vaulted games?
- Should screenshots/metadata of vaulted games also stay hidden in all contexts?

---

## 2. In-App App Icon Customization (Drop PNG)

- Status: `done`
- Priority: `medium`
- Goal: Let users replace the app icon from inside the app by dropping a new PNG image.

### Work note

- Started on 2026-04-10.
- Completed on 2026-04-10.

### Summary

Add a settings action that allows users to drop/select a PNG icon and apply it as the app icon for future packaged builds (and, where possible, for local shortcuts).

### Core behavior

- Add an "App Icon" section in setup/preferences.
- Support drag-and-drop and file picker for `.png` files.
- Validate image constraints (minimum size, transparency support, aspect ratio handling).
- Store selected icon path/source in app config.
- Convert/update icon assets automatically (PNG to ICO pipeline).
- Provide a clear "Rebuild installer to apply" flow for installed app icon changes.

### UX notes

- Show current icon preview.
- Show validation errors for unsupported files.
- Offer "Reset to default icon".
- Explain which icon targets are affected (installer, app executable, desktop shortcut).

### Technical notes

- Reuse existing icon conversion pipeline (`scripts/build-icon.mjs`).
- Preserve transparent background during conversion.
- Trigger packaging scripts after icon update when user chooses to rebuild.

### Open questions

- Should icon updates be applied immediately to existing shortcuts, or only on next installer build?
- Should we keep icon history/rollback slots?
- Do we allow non-square PNG inputs with automatic transparent padding?

---

## 3. New Version Notifications and Mismatch Badges

- Status: `done`
- Priority: `medium`
- Goal: Notify users when a game has a newer detected version than the one currently recorded as latest in `game.nfo`.

### Work note

- Completed on 2026-04-11.

### Summary

During startup or manual rescans, detect games whose detected latest version does not match `latest_version` in metadata. Surface this through a persistent top-level notification list and per-game badges in all gallery views.

### Core behavior

- On each scan, compare:
	- Detected latest version from version folders.
	- Stored `latest_version` value in `game.nfo`.
- If they differ, mark game as "new version available".
- Show a top-bar icon (notification center) with count of mismatches.
- Clicking the icon opens a dropdown/modal list of affected games.
- Show a per-game badge/icon in poster/card/compact/expanded when mismatch exists.
- Clicking the per-game badge (or action in notification center) updates `latest_version` in `game.nfo` to the detected latest version.

### UX notes

- Notification center entries should persist until resolved or dismissed.
- Per-game badge should persist while mismatch remains.
- Dismissed notifications can be hidden from the global list, but mismatch state can still drive the per-game badge.
- Notification item should include game name, current metadata latest version, and detected latest version.

### Technical notes

- Prefer existing version comparison logic to avoid lexical ordering issues.
- Trigger checks from existing scan pipeline (startup and manual rescan).
- Keep this feature scanner-driven (no folder watcher required in first version).

### Open questions

- Should dismiss state survive app restarts?
- Should resolving from one place (badge/list) automatically clear all related notification entries?
- Should there be a bulk action: "Mark all as latest"?

---

## 4. Quick Folder Navigation from Game and Version Menus

- Status: `done`
- Priority: `medium`
- Goal: Improve folder access by adding direct "open folder" actions from game and version context menus.

### Summary

Add context-menu actions to jump directly to filesystem folders:

- From game card right-click menu: navigate to the folder containing all versions for that game.
- In open game detail view: show all available versions in a right-side column in metadata area.
- Right-clicking a specific version entry shows a context menu action to navigate to that exact version folder.

### Core behavior

- Extend game context menu with: "Open game folder".
- In detail/open view:
	- Add a dedicated versions section/column in the metadata area.
	- Show each detected version as an item (name + optional metadata flag).
- Right-click on version item opens a small context menu with: "Open version folder".
- Folder navigation should open native file explorer focused in the target folder.

### UX notes

- Keep actions consistent with existing context menu language.
- Version list should remain visible and easy to scan when many versions exist.
- If path is unavailable, show a clear status/toast message instead of failing silently.

### Technical notes

- Implement folder opening in Electron main process (native shell API).
- Reuse existing IPC/context menu approach already used for game actions.
- Version data can reuse existing scanned `versions` array in game summary.

### Open questions

- Should we offer both "Open folder" and "Open in terminal"?
- Should version list be sortable by semantic version and/or modified date?
- Should this action also be available from notification items (future features)?

### Work note

- Started on 2026-04-10.

---

## 5. Filter Pane Redesign (Tag Bubbles + Condensed Layout)

- Status: `done`
- Priority: `medium`
- Goal: Make the filter panel denser and easier to scan by replacing vertical tag inputs with compact tag bubbles and improving column usage.

### Work note

- Started on 2026-04-10.
- Replaced vertical tag rule rows with bubble-based interaction (`+` add, click-to-edit, right-click remove).
- Condensed right-side controls so `Minimum score` and `Order by` share horizontal space.
- Completed on 2026-04-10.

### Summary

Refactor the filter panel layout so tag rules take less vertical space and controls are organized more efficiently.

### Core behavior

- Replace current vertical tag rule inputs with tag "bubbles" arranged horizontally and wrapping to new lines.
- Bubble lifecycle:
	- A `+` bubble appears to the right of the last tag bubble.
	- Clicking `+` adds a new empty tag bubble.
	- Clicking a bubble puts it into inline edit mode.
	- Right-clicking a bubble removes it.
- Tag bubbles should still support include/exclude behavior (for example, `-tag` for exclude).
- Layout target:
	- Up to 3 columns in filter panel main area when space allows.
	- `Minimum score` and `Order by` can share horizontal space (no need to consume full-width rows).
- Presets should always stay in a dedicated right-side column for quick access.

### UX notes

- Keep bubble interaction obvious with hover/focus states.
- Preserve keyboard accessibility for edit/add/remove workflows.
- Maintain existing filter semantics and Apply behavior.
- Ensure mobile/narrow view gracefully collapses back to fewer columns.

### Technical notes

- This is primarily a renderer/UI change (`src/App.tsx` + `src/styles.css`).
- Existing filter data model can remain mostly unchanged (list of tag strings).
- Add small interaction state for active bubble editing and context removal.

### Open questions

- Should empty bubbles auto-remove on blur?
- Should right-click removal require confirmation?
- Should long tags truncate visually or auto-expand bubble width?

---

## 6. Top Bar Action Prioritization + F5 Rescan Shortcut

- Status: `done`
- Priority: `medium`
- Goal: Improve action discoverability by moving rarely used setup actions out of the top bar and promoting frequently used filter access, plus add keyboard rescan shortcut.

### Work note

- Completed on 2026-04-10.
- Moved `Choose library folder` from top bar into Setup section.
- Promoted filter toggle as highlighted top-bar action.
- Added global `F5` shortcut that prevents reload and triggers existing rescan flow.

### Summary

Adjust top-bar button priorities:

- Move "Choose library folder" into Setup side panel (rarely used after initial setup).
- Promote "Show filters" / "Hide filters" as the highlighted primary action in top bar, positioned on the right.
- Add `F5` keyboard shortcut for rescan.

### Core behavior

- Remove "Choose library folder" button from top bar.
- Add "Choose library folder" button to Setup section.
- Use primary/highlighted style for filter toggle in top bar.
- Keep "Rescan" button in top bar and trigger same logic when `F5` is pressed.
- `F5` should be available globally in app UI while avoiding accidental browser-level reload behavior.

### UX notes

- Preserve clear separation between setup/configuration and day-to-day browsing actions.
- Keep top-bar actions compact and task-focused for frequent use.
- Show subtle status feedback when rescan is triggered via keyboard.

### Technical notes

- Renderer-only change (`src/App.tsx` + `src/styles.css`).
- Add window keydown handler for `F5` to call existing `refreshScan` flow.
- Ensure key handler is cleaned up on unmount.

### Open questions

- Should `Ctrl+R` also trigger rescan, or only `F5`?
- Should `F5` be disabled while scan is already in progress?

---

## 7. Consistent Open/Play Actions in Focused Views

- Status: `done`
- Priority: `medium`
- Goal: Keep game actions consistent by ensuring both `Open` and `Play` are available in focused game views.

### Work note

- Promoted to in-progress on 2026-04-10 as next implementation target after Feature 9.
- Completed on 2026-04-10 with `Play` and `Open` actions available in focused panels and open/detail-focused layouts.

### Summary

The `Open` action currently exists in game cards/list views, but it should also be present in focused game panels (inline focus and side/detail focus), alongside the `Play` button.

### Core behavior

- In focused game views, show both actions:
	- `Play`
	- `Open`
- `Open` should navigate to the game's open/detail view, matching behavior in non-focused cards.
- Button placement should be clear and consistent with the rest of the app's action patterns.

### UX notes

- Keep action ordering consistent across all surfaces.
- Avoid requiring users to leave focused context just to open the game view.
- Ensure keyboard and controller/remote-style navigation (if added later) can reach both actions.

### Technical notes

- Renderer/UI adjustment in focused card rendering component.
- Reuse existing open/play handlers to avoid duplicated logic.

### Open questions

- Should focused view action buttons mirror the exact same style/size as card actions?
- Should this include any context-menu parity requirements in focused views?

---

## 8. Adjustable Text and Padding Scaling Across Views

- Status: `done`
- Priority: `medium`
- Goal: Keep typography and spacing proportional when grid density changes by adding user controls for base sizing and optional dynamic scaling.

### Work note

- Started on 2026-04-10.
- Refined scope after validation: base font/spacing controls now target game content areas only (grid/list/card/detail), not top/setup menus.
- Added separate global zoom behavior aligned with browser-style zoom controls (`Ctrl + wheel`, `+`, `-`, `Ctrl+0`).
- Updated zoom implementation so global zoom also scales images consistently with the rest of the UI.
- Tuned dynamic scaling curve for stronger, more predictable response to grid column density.
- Added media scaling coupling so when content scales down/up, image layout dimensions in list/card/detail/focus views scale proportionally.
- Added `0 = auto` behavior for poster/card column settings so columns can adapt to effective element size.
- Card view adjusted to use top-stacked media (image above metadata) to reduce wasted vertical whitespace in denser layouts.
- Expanded view media column now scales more responsively with content/media scaling.
- Global zoom container behavior adjusted so zoom-out can actually increase visible row density instead of preserving the same row count.
- Refactored stylesheet into split files (base, shared gallery, per-view files, focus/detail, modals/media, responsive) to simplify future maintenance.
- Marked complete on 2026-04-10 after validation in poster/card/compact/expanded/detail flows.

### Summary

When users increase grid density (for example, adding more columns in card view), images scale correctly but text and spacing do not. Add two options:

- A manual base-size control for font and padding.
- A toggle to enable automatic scaling based on grid density.

### Core behavior

- Add option 1: base UI size controls.
	- Adjustable base `font size` value.
	- Adjustable base `padding/spacing` value.
	- Applies consistently across all main views.
- Add option 2: dynamic scaling toggle.
	- When enabled, text and spacing scale down/up with grid density changes (such as column count).
	- Keeps readability bounds with min/max clamp values.
- Manual controls and dynamic scaling should coexist with predictable behavior.
	- Define whether dynamic scaling multiplies the base values or overrides them.

### UX notes

- Provide live preview as settings are changed.
- Keep default values close to current visual baseline.
- Show a quick reset action to restore defaults.
- Maintain accessibility and readability at small sizes.

### Technical notes

- Prefer CSS custom properties as single source of truth for typography and spacing scales.
- Centralize scale computation in one renderer helper to avoid per-view drift.
- Ensure all view variants (poster/card/compact/expanded/focused/open/detail) consume the same scale variables.

### Open questions

- Should dynamic scaling be global only, or configurable per view type?
- Should line-height and icon size scale with the same factor as text?
- Should dynamic scaling react only to column count, or also to container width/window size?

---

## 9. Action Label Wording Refresh (Top Bar + Game Actions)

- Status: `done`
- Priority: `medium`
- Goal: Replace current action wording with clearer labels across top-bar and game-level actions while keeping behavior unchanged.

### Work note

- Started on 2026-04-10 as next recommended task after Feature 8 completion.
- Initial implementation pass will centralize action label strings before applying revised wording values.
- Centralized core action labels in renderer so top-bar/detail/game actions share one label source.
- Updated action placement: list views (compact/expanded) now stack actions on the right side, while poster/card keep bottom action placement.
- Added focus-card action placement in bottom-right area with `Play` and `Open` actions.
- Replaced agreed action wording with Lucide icon buttons for `Rescan`, `Show/Hide setup`, `Show/Hide filters`, `Play`, `Open`, and `Back`.
- Marked complete on 2026-04-10 after implementation and build validation.

### Summary

Introduce a wording refresh for key actions before broader icon/text updates. This item focuses on label copy only (not changing action logic), covering:

- `Rescan`
- `Show setup`
- `Show filters`
- `Play`
- `Open`
- `Back` (from open game card/view)

### Core behavior

- Keep all existing click/keyboard behavior exactly the same.
- Replace visible text labels for listed actions with new wording choices.
- Apply wording consistently across every place each action appears.
- Ensure toggled actions (for example setup/filters visibility) have clear paired labels.

### UX notes

- Prefer short, scan-friendly labels that remain readable in compact layouts.
- Validate wording in all supported views (poster/card/compact/expanded/focused/open/detail).
- Preserve accessibility semantics (`aria-label`) when visible text changes.

### Technical notes

- Renderer/UI text update only.
- Consider centralizing action strings into one constants map to avoid drift.
- No backend, scanner, or metadata changes required.

### Open questions

- Should this be English-only initially, or prepared for future localization?
- Should the same wording be mirrored in context menus/tooltips where applicable?
- Do we want separate wording profiles for icon+text mode vs text-only mode?
