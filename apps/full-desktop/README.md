# Full Desktop App Boundary

This folder marks the full desktop app boundary for the future multi-app workspace layout.

Current implementation status:
- Desktop renderer source now lives in apps/full-desktop/src.
- Desktop Electron source now lives in apps/full-desktop/electron.
- Desktop packaging is still controlled by the root package.json electron-builder config.

Migration intent:
- Keep full-desktop behavior stable while shared modules migrate into packages.
- Move release packaging config into app-scoped packaging only when dual-executable release flow is finalized.
