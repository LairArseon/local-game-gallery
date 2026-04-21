# Required Game Folder Structure

This page defines the on-disk structure Local Game Gallery expects when scanning your library.

## Required Layout

Use one folder per game, with version folders inside each game folder.

```text
<gamesRoot>/
  MyGame/
    game.nfo
    activitylog
    pictures/
      poster.png
      card.png
      background.png
      Screen1.png
      Screen2.jpg
    v1.0.0.0/
      version.nfo
      Game.exe
    v2.0.0.0/
      version.nfo
      Game.exe
```

Notes:

- Version folders are detected with the default pattern `^v\d+\.\d+\.\d+\.\d+$`.
- By default, the media folder name is `pictures`.
- If `game.nfo`, `version.nfo`, or `pictures` are missing, the scanner can auto-create the missing files/folder.

## `game.nfo` Fields

The gallery reads and writes `game.nfo` using bracketed keys:

```ini
; Local Game Gallery metadata
[title] MyGame
[latest_version] v2.0.0.0
[score] 9.0
[status] Playing
[description] Main summary shown in metadata
[note] Optional note line 1
[note] Optional note line 2
[tag] roguelike
[tag] co-op
[launch_executable] v2.0.0.0/Game.exe
[custom:engine] Unity
```

Supported keys:

- `[title]`
- `[latest_version]`
- `[score]`
- `[status]`
- `[description]` (or `[summary]`)
- `[note]` or `[notes]` (repeatable)
- `[tag]` (repeatable) or `[tags]` (comma-separated)
- `[launch_executable]` (or `[launch_path]`)
- `[custom:<key>]` for custom metadata entries

## `version.nfo` Fields

When missing, the scanner creates a default `version.nfo` like this:

```ini
; Version metadata
[version] v2.0.0.0
[changes] Add notes for this version.
[release_date]
```

Any `.nfo` file inside the version folder counts as "has metadata" for version detection.

## `pictures` Folder and Naming

Recognized image extensions:

- `.png`
- `.jpg`
- `.jpeg`
- `.webp`
- `.gif`
- `.bmp`

Recognized special file stems:

- `poster` -> poster artwork
- `card` -> card/list artwork
- `background` -> detail background artwork
- `Screen<number>` -> screenshots (for example: `Screen1.png`, `Screen2.jpg`)

Screenshot behavior:

- New screenshots are imported as `Screen1`, `Screen2`, etc.
- Removing a screenshot reindexes remaining screenshots to keep sequence order.

## `activitylog`

Each game folder can include an `activitylog` file. The scanner reads the last non-empty line and exposes it as `lastPlayedAt`.

Example:

```text
2025-02-10T21:05:44.000Z
2025-02-12T18:43:02.000Z
```

In this example, the effective value is `2025-02-12T18:43:02.000Z`.

## Future File-Creating Features

Any future features that create or maintain game files on disk should follow this same structure contract:

- game-level metadata in `game.nfo`
- version-level metadata in `<version>/version.nfo`
- media in `pictures/`
- usage timestamps/events in `activitylog`

When new generated files are introduced, document them on this page and keep the README schema snippet in sync.