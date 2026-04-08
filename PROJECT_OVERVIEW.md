# Local Game Gallery - Project Overview

## Quick Start

1. Install dependencies:
  - `npm install`
2. Run in development:
  - `npm run dev`
3. Build for production:
  - `npm run build`
4. Launch built app:
  - `npm start`

First-time in app:

1. Click **Choose library folder**.
2. Review setup fields (root, exclude patterns, version pattern, pictures folder, status choices).
3. Click **Save setup**.
4. Click **Rescan**.

## 1. Purpose

Local Game Gallery is a desktop application built with Electron + React + TypeScript.
It scans a local games folder, reads/writes metadata, manages images, and provides multiple gallery views with filtering, tagging, and launch support.

## 2. High-Level Architecture

The app is split into two runtime layers:

- Electron Main Process (`electron/`)
  - Owns native capabilities: filesystem, dialogs, context menu, launching executables, app window lifecycle, and IPC handlers.
- Renderer (React UI) (`src/`)
  - Owns UI state, views, modals, filtering, presets, and user interactions.

Data moves between Renderer and Main through IPC via preload bridge (`electron/preload.ts`) using `window.gallery.*` methods.

## 3. Core Modules

### Renderer modules (`src/`)

- `src/App.tsx`
  - Main UI container and app logic.
  - Setup panel, filters/presets, all gallery view modes, detail page, metadata modal, image management modal.
  - Calls IPC through `window.gallery` for scan/save/import/play/reorder/remove actions.
- `src/styles.css`
  - Global styling, layout system, card/view styling, modal styles, filter panel, autocomplete UI.
- `src/types.ts`
  - Shared TypeScript contracts used by both renderer and main process.
  - Defines gallery config, metadata schema, IPC payloads/results, and API surface.
- `src/main.tsx`
  - React entrypoint.

### Electron modules (`electron/`)

- `electron/main.ts`
  - Electron app bootstrap + BrowserWindow creation.
  - Registers all IPC handlers (`gallery:*`).
  - Integrates native dialogs, context menu, and game executable launching.
- `electron/preload.ts`
  - Secure context bridge (`contextBridge.exposeInMainWorld`) for renderer access to whitelisted IPC calls.
- `electron/config.ts`
  - Loads/saves persisted app config JSON in `app.getPath('userData')`.
- `electron/game-library.ts`
  - Metadata read/write (`game.nfo`), media import/reorder/remove/reindex logic.
- `electron/scanner.ts`
  - Scans game folders and returns structured game summaries.
- `electron/tsconfig.json`
  - TypeScript config for Electron build output.

## 4. Packages Used

## Runtime dependencies

- `react`
  - Renderer UI library.
- `react-dom`
  - React DOM renderer binding.

## Development/build dependencies

- `electron`
  - Desktop shell/runtime.
- `typescript`
  - Static typing and TS compilation.
- `vite`
  - Renderer bundler/dev server.
- `@vitejs/plugin-react`
  - React plugin for Vite.
- `concurrently`
  - Runs multiple dev scripts in parallel.
- `cross-env`
  - Cross-platform environment variable support in npm scripts.
- `electron-builder`
  - Creates Windows distributables (`win-unpacked`, NSIS installer).
- `wait-on`
  - Waits for dev server/build artifacts before launching Electron.
- `nodemon`
  - Watches Electron output and restarts app in development.
- `png-to-ico`
  - Converts PNG icon assets to Windows `.ico`.
- `sharp`
  - Pads non-square PNG icons to a transparent square before ICO conversion.
- `@types/node`, `@types/react`, `@types/react-dom`
  - Type definitions.

## 5. Build and Run Flow

### Development mode

`npm run dev`

This starts three parallel processes:

1. `dev:renderer` - starts Vite on `127.0.0.1:5173`.
2. `watch:electron` - TypeScript watch for `electron/` to `dist-electron/`.
3. `dev:electron` - waits for renderer + electron output, then starts Electron with nodemon.

### Production build

`npm run build`

1. `build:renderer` - Vite builds frontend assets to `dist/`.
2. `build:electron` - TypeScript compiles electron code to `dist-electron/`.

### Start built app

`npm start`

Launches Electron using compiled output and built renderer assets.

### Windows packaging

- `npm run pack:win`
  - Creates unpacked app output in `release/win-unpacked`.
- `npm run dist:win`
  - Creates NSIS installer in `release/`.

Both scripts run:

1. Renderer + Electron build
2. Icon conversion (`npm run build:icon`)
3. `electron-builder` packaging

## 6.1 Icon Conversion and Transparency

Icon source and output:

- Source PNG: `icon/icon.png`
- Generated ICO: `icon/icon.ico`
- Conversion script: `scripts/build-icon.mjs`

How it works:

1. The script reads `icon/icon.png`.
2. If the image is not square, it pads it to a square canvas using a fully transparent background.
3. It converts the resulting PNG buffer to `.ico`.
4. The generated `icon/icon.ico` is used by `electron-builder` for app/installer icons.

Notes:

- Transparent backgrounds are preserved.
- You only need to replace `icon/icon.png`; packaging regenerates `icon/icon.ico` automatically.

## 6. Important Data and Files

- App config (persisted): userData `config.json`
  - Stores setup fields, view preferences, status choices, and filter presets.
- Per-game metadata: `game.nfo` in each game folder
  - Stores title, latest version, score, status, description, notes, tags, launch executable, custom tags.
- Images: game pictures folder (default: `pictures`)
  - Supports poster/card/background/screenshots naming conventions.

## 7. IPC API Summary (`window.gallery`)

Main renderer-available operations include:

- Config: get/save config, pick root
- Scanning: scan games
- Metadata: save metadata
- Media: import from dialog, import dropped files, reorder screenshots, remove screenshot
- Execution: play game
- Menus/events: show context menu, subscribe to context menu actions

## 8. Current Feature Set (at a glance)

- Multi-view gallery: poster, card, compact, expanded
- Detail page with background image and screenshot lightbox
- Metadata editing with status, tags, notes, custom tags
- Tag autocomplete in filters and metadata
- Filtering: tags include/exclude, minimum score, status, ordering
- Presets for filter configurations
- Image management: add, reorder, remove screenshots
- Game launching with executable selection + persistence

## 9. Output Structure

- Renderer build output: `dist/`
- Electron compiled output: `dist-electron/`
- App entry (Electron): `dist-electron/electron/main.js`
