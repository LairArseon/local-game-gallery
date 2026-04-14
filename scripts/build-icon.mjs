import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const iconRoot = path.resolve('icon');
const rootPngPath = path.join(iconRoot, 'icon.png');
const rootIcoPath = path.join(iconRoot, 'icon.ico');
const preferredRootFallbackDirs = ['standalone-client-icon', 'service-icon', 'web-client-icon'];
const icoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const transparentBackground = { r: 0, g: 0, b: 0, alpha: 0 };

if (!existsSync(iconRoot)) {
  throw new Error(`Icon folder not found: ${iconRoot}`);
}

function selectRootFallbackSource(iconJobs) {
  for (const dirName of preferredRootFallbackDirs) {
    const match = iconJobs.find((job) => job.dirName === dirName);
    if (match) {
      return match.sourcePath;
    }
  }

  return iconJobs[0]?.sourcePath;
}

async function discoverIconJobs() {
  const entries = await readdir(iconRoot, { withFileTypes: true });
  const jobs = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const sourcePath = path.join(iconRoot, entry.name, 'icon.png');
    if (!existsSync(sourcePath)) {
      continue;
    }

    jobs.push({
      dirName: entry.name,
      sourcePath,
      outputPath: path.join(iconRoot, entry.name, 'icon.ico'),
    });
  }

  return jobs;
}

async function buildIcoBuffer(sourcePath) {
  const metadata = await sharp(sourcePath, { failOn: 'none' }).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (!width || !height) {
    throw new Error(`Unable to read icon dimensions: ${sourcePath}`);
  }

  const pngBuffers = await Promise.all(
    icoSizes.map((size) => sharp(sourcePath, { failOn: 'none' })
      .resize(size, size, {
        fit: 'contain',
        background: transparentBackground,
      })
      .png()
      .toBuffer()),
  );

  return pngToIco(pngBuffers);
}

const iconJobs = await discoverIconJobs();
const outputToSource = new Map();

if (existsSync(rootPngPath)) {
  outputToSource.set(rootIcoPath, rootPngPath);
} else {
  const fallbackSource = selectRootFallbackSource(iconJobs);
  if (!fallbackSource) {
    throw new Error('No icon/icon.png or icon/<component>/icon.png files were found.');
  }

  outputToSource.set(rootIcoPath, fallbackSource);
  console.warn(`[build-icon] icon/icon.png not found, using fallback source for root icon: ${fallbackSource}`);
}

for (const iconJob of iconJobs) {
  outputToSource.set(iconJob.outputPath, iconJob.sourcePath);
}

for (const [outputPath, sourcePath] of outputToSource.entries()) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const icoBuffer = await buildIcoBuffer(sourcePath);
  await writeFile(outputPath, icoBuffer);
  console.log(`[build-icon] generated: ${outputPath}`);
}
