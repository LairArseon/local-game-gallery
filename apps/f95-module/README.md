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

## Thread version history

The manual thread-content fetch reads the `.f95wg-thread` version strip, including
every reported version, its latest-release marker, source date/time fields,
changelog tooltip, and release-cadence summary. The detail panel displays versions
and dates together; hover, keyboard focus, or tap reveals the complete changelog
and exact release time. Escape or an outside tap closes the tooltip.

The history is stored as schema-versioned JSON in the game's `game.nfo` custom tag
`module_f95_version_history`. JSON Unicode escapes protect newlines and literal
backslashes from the existing NFO decoder. Missing widgets do not clear previously
stored history, and games without history retain the legacy version display.

`module_f95_release_version` and `module_f95_release_at` track the observed release
baseline. A different version with a strictly later valid release timestamp sets
`module_f95_up_to_date` to `false` and contributes the existing F95 update
notification. Version labels are not compared numerically. The first successful
fetch initializes the baseline without notifying, unless the previously stored
version can be matched to an older dated entry in the fetched history.

Repeated fetches, older releases, and date corrections for the same version do not
create a new update. Acknowledgement preserves the baseline; dismissing the
notification suppresses that release's stable marker until another update appears.
Event fields use `module_f95_update_marker`, `module_f95_update_at`, and
`module_f95_update_title`, with fallback to existing RSS fields for older metadata.

Page timestamps use `module_f95_thread_updated_at`, independently of the RSS
comparison timestamp in `module_f95_last_updated`. RSS initialization preserves an
already pending manual-fetch update. Gallery-wide refresh remains RSS-only.

## Regression Check

Run `npm run test:f95` to exercise the native DOM parser, real NFO round-trips,
release detection, notification generation, RSS compatibility, and tooltip
interactions with both client styles at desktop and mobile widths. Add
`-- --screenshots` to capture the tested views in a temporary directory.