import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const sourcePath = path.resolve('icon', 'icon.png');
const outputPath = path.resolve('icon', 'icon.ico');

if (!existsSync(sourcePath)) {
  throw new Error(`Icon source not found: ${sourcePath}`);
}

await mkdir(path.dirname(outputPath), { recursive: true });

const image = sharp(sourcePath, { failOn: 'none' });
const metadata = await image.metadata();
const width = metadata.width ?? 0;
const height = metadata.height ?? 0;

if (!width || !height) {
  throw new Error('Unable to read icon dimensions.');
}

const size = Math.max(width, height);
const squarePngBuffer = width === height
  ? await image.png().toBuffer()
  : await image
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

const icoBuffer = await pngToIco(squarePngBuffer);
await writeFile(outputPath, icoBuffer);

console.log(`Generated icon: ${outputPath}`);
