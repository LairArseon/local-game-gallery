# Local Game Gallery

A local-first Electron + React game gallery with a standalone HTTP service for browser/mobile clients.

## Documentation

- Docs hub: [docs/README.md](docs/README.md)
- Required game folder structure: [docs/operations/required-game-folder-structure.md](docs/operations/required-game-folder-structure.md)
- Docker operations: [docs/operations/docker-compose.md](docs/operations/docker-compose.md)
- Bare-metal operations: [docs/operations/baremetal-service.md](docs/operations/baremetal-service.md)
- Component installer matrix: [docs/operations/component-bundle-matrix.md](docs/operations/component-bundle-matrix.md)

## Runtime Paths

### Required games root schema

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
		v2.0.0.0/
			version.nfo
```

Default version folder pattern: `^v\d+\.\d+\.\d+\.\d+$`

See full details and `.nfo` field definitions in [docs/operations/required-game-folder-structure.md](docs/operations/required-game-folder-structure.md).

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
