# Standalone Client App

This folder is the dedicated development surface for the standalone desktop client executable.

Current scope in this phase:
- Electron desktop shell with separate renderer and electron entrypoints.
- Launch-time backend discovery against compatibility endpoints.
- Manual backend URL fallback when discovery does not find a compatible backend.
- After successful connection, the standalone window renders the full gallery app UI.
- Same-device heuristic flagging to support host-local feature gating decisions.
- No embedded backend runtime in this client.

Run from repo root:
- npm run dev:standalone-client
- npm run build:standalone-client
- npm run start:standalone-client

Windows packaging:
- npm run pack:standalone-client:win
- npm run dist:standalone-client:win
