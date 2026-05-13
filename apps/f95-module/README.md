# F95 Module

This app-owned module is the isolated home for F95-specific functionality.

Planned responsibilities:
- Per-game F95 id handling through game NFO custom tags.
- RSS-driven incremental update sync.
- Versioned thread-page parsing isolated behind dedicated parser files.
- Manual, per-game thread-page fetches only. Gallery-wide refresh must stay RSS-only.
- Module-owned config state for checkpoints and diagnostics.
- Notification feed contributions.
- Focused and detail view contributions.

The base app shell should only depend on generic module-host contracts. F95-specific parsing, naming, and presentation logic should remain inside this module.