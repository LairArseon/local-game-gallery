import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  let image = null;
  let push = false;
  let platform = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--push') {
      push = true;
      continue;
    }

    if (arg === '--platform') {
      platform = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (!image && !arg.startsWith('--')) {
      image = arg;
      continue;
    }
  }

  return {
    image,
    push,
    platform,
  };
}

function runDocker(args) {
  const result = spawnSync('docker', args, {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const serviceVersion = String(packageJson.version ?? '1.0.0').trim() || '1.0.0';

const parsed = parseArgs(process.argv.slice(2));
const targetImage = parsed.image ?? String(process.env.DOCKERHUB_IMAGE ?? '').trim();
if (!targetImage) {
  console.error('Missing target image. Provide it as the first arg or DOCKERHUB_IMAGE env var.');
  console.error('Example: node scripts/dockerhub-image.mjs your-user/local-game-gallery-service --push');
  process.exit(1);
}

const tags = [`${targetImage}:latest`, `${targetImage}:${serviceVersion}`];
const args = ['buildx', 'build', '--file', 'docker/Dockerfile.service'];

if (parsed.platform) {
  args.push('--platform', parsed.platform);
}

for (const tag of tags) {
  args.push('--tag', tag);
}

args.push('--build-arg', `BUILD_VERSION=${serviceVersion}`);
args.push(parsed.push ? '--push' : '--load');
args.push('.');

console.log(`[dockerhub-image] building ${targetImage}`);
console.log(`[dockerhub-image] tags: ${tags.join(', ')}`);
if (parsed.platform) {
  console.log(`[dockerhub-image] platform: ${parsed.platform}`);
}
console.log(`[dockerhub-image] mode: ${parsed.push ? 'push' : 'load'}`);

runDocker(args);
