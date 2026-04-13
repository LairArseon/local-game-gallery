# Local Game Gallery

A local-first Electron + React game gallery with a standalone HTTP service for browser/mobile clients.

## Documentation

- Docs hub: [docs/README.md](docs/README.md)
- Docker operations: [docs/operations/docker-compose.md](docs/operations/docker-compose.md)
- Bare-metal operations: [docs/operations/baremetal-service.md](docs/operations/baremetal-service.md)
- Component installer matrix: [docs/operations/component-bundle-matrix.md](docs/operations/component-bundle-matrix.md)

## Runtime Paths

### Docker Compose (recommended end-user path)

```powershell
Copy-Item docker/.env.example docker/.env
docker compose --env-file docker/.env -f docker/compose.yml up --build -d
```

### Bare-metal local stack

```powershell
npm run up:baremetal
npm run down:baremetal
```

For service-only and troubleshooting details, see [docs/operations/baremetal-service.md](docs/operations/baremetal-service.md).

## Development Commands

- Full desktop app:

```powershell
npm run dev:full-desktop
```

- Standalone desktop client:

```powershell
npm run dev:standalone-client
```

- Web client:

```powershell
npm run dev:web-client
```

- Build selectable bundle installer (Service/Web/Desktop):

```powershell
npm run dist:bundle-installer:win
```

## Quick Commands

```powershell
npm install
npm run dev
npm run build
npm start
```
