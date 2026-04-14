import process from 'node:process';
import { appendLogEvent } from './logger';
import { startGalleryHttpService } from './service';

async function run() {
  const startedAt = new Date().toISOString();
  const appVersion = String(
    process.env.LGG_SERVICE_BUILD
      ?? process.env.npm_package_version
      ?? '1.0.0',
  ).trim() || '1.0.0';

  const service = await startGalleryHttpService({
    appVersion,
    startedAt,
  });

  const health = service.getHealth();
  console.log(`[gallery-service] listening on http://${health.host}:${health.port}`);

  const shutdown = async (signal: string) => {
    console.log(`[gallery-service] shutdown requested (${signal})`);
    await service.stop().catch(() => undefined);
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

run().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[gallery-service] failed to start: ${message}`);

  await appendLogEvent({
    level: 'error',
    source: 'service-cli',
    message: `Failed to start standalone service: ${message}`,
  }).catch(() => undefined);

  process.exit(1);
});
