# Bare-Metal Service and Local Stack

[Back to Main README](../../README.md) | [Back to Docs Hub](../README.md)

This guide covers host-native (non-Docker) service and client operations.

## Runtime shape

- Service tray runtime (API backend)
- Web client tray host (serves browser UI)
- Standalone desktop client (Electron window)

## Service-only runtime

```powershell
npm run build:service
npm run start:service
```

Headless service fallback (no tray UI):

```powershell
npm run start:service:headless
```

## Web tray host runtime

```powershell
npm run build:electron
npm run build:web-client
npm run start:web-client
```

Default browser URL: `http://127.0.0.1:4173`

## Standalone desktop client runtime

```powershell
npm run build:standalone-client
npm run start:standalone-client
```

## Full bare-metal stack

Start all three runtimes together:

```powershell
npm run up:baremetal
```

Stop bare-metal runtimes:

```powershell
npm run down:baremetal
```

## Troubleshooting quick checks

- If one runtime fails immediately, run `npm run down:baremetal` first to clear stale processes, then retry.
- If service startup fails, ensure `dist-electron/electron/service-tray.js` exists (run `npm run build:electron`).
- If web tray startup fails, ensure both `dist-electron` and `dist-web-client` are current.
- If standalone startup fails, rebuild with `npm run build:standalone-client`.

## Migration note

Current service runtime implementation remains under `apps/full-desktop/electron` (`service.ts`, `service-cli.ts`) until service code migration into `services/gallery-service` is completed.