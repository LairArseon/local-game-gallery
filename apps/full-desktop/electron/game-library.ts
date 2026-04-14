import { copyFile, mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  GameMediaAssets,
  GameMetadata,
  ImportDroppedGameMediaPayload,
  SaveGameMetadataPayload,
  VersionSummary,
} from '../src/types';

const defaultGameNfoName = 'game.nfo';
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

export function createDefaultMetadata(latestVersion = ''): GameMetadata {
  return {
    latestVersion,
    score: '',
    status: '',
    description: '',
    notes: [''],
    tags: [],
    launchExecutable: '',
    customTags: [],
  };
}

function sanitizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

function compareVersions(left: string, right: string) {
  const normalize = (value: string) =>
    value
      .replace(/^v/i, '')
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0);

  const leftParts = normalize(left);
  const rightParts = normalize(right);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

export function getLatestVersionName(versions: VersionSummary[]) {
  if (!versions.length) {
    return '';
  }

  return [...versions].sort((left, right) => compareVersions(right.name, left.name))[0]?.name ?? '';
}

export async function readGameMetadata(gamePath: string, gameName: string, versions: VersionSummary[]) {
  const fallbackLatestVersion = getLatestVersionName(versions);
  const nfoPath = path.join(gamePath, defaultGameNfoName);

  try {
    const raw = await readFile(nfoPath, 'utf8');
    const metadata = createDefaultMetadata(fallbackLatestVersion);

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';')) {
        continue;
      }

      const match = trimmed.match(/^\[([^\]]+)\]\s*(.*)$/);
      if (!match) {
        continue;
      }

      const [, rawKey, value] = match;
      const key = rawKey.trim().toLowerCase();

      if (key === 'title') {
        continue;
      }

      if (key === 'latest_version') {
        metadata.latestVersion = value;
        continue;
      }

      if (key === 'score') {
        metadata.score = value;
        continue;
      }

      if (key === 'status') {
        metadata.status = value.trim();
        continue;
      }

      if (key === 'description' || key === 'summary') {
        metadata.description = value;
        continue;
      }

      if (key === 'note' || key === 'notes') {
        metadata.notes.push(value);
        continue;
      }

      if (key === 'tag') {
        const tag = value.trim();
        if (tag) {
          metadata.tags.push(tag);
        }
        continue;
      }

      if (key === 'launch_executable' || key === 'launch_path') {
        metadata.launchExecutable = value.trim();
        continue;
      }

      if (key === 'tags') {
        for (const tag of value.split(',').map((entry) => entry.trim()).filter(Boolean)) {
          metadata.tags.push(tag);
        }
        continue;
      }

      if (key.startsWith('custom:')) {
        metadata.customTags.push({
          key: rawKey.slice('custom:'.length).trim(),
          value,
        });
      }
    }

    metadata.notes = metadata.notes.filter(Boolean);
    if (!metadata.notes.length) {
      metadata.notes = [''];
    }
    metadata.tags = [...new Set(metadata.tags.map((tag) => tag.trim()).filter(Boolean))];
    if (!metadata.latestVersion) {
      metadata.latestVersion = fallbackLatestVersion;
    }

    return metadata;
  } catch {
    return createDefaultMetadata(fallbackLatestVersion || gameName);
  }
}

export async function saveGameMetadata(payload: SaveGameMetadataPayload) {
  const nfoPath = path.join(payload.gamePath, defaultGameNfoName);
  const lines = [
    '; Local Game Gallery metadata',
    `[title] ${payload.title}`,
    `[latest_version] ${payload.metadata.latestVersion}`,
    `[score] ${payload.metadata.score}`,
    `[status] ${payload.metadata.status}`,
    `[description] ${payload.metadata.description}`,
  ];

  for (const note of payload.metadata.notes.map((entry) => entry.trim()).filter(Boolean)) {
    lines.push(`[note] ${note}`);
  }

  for (const tag of payload.metadata.tags.map((entry) => entry.trim()).filter(Boolean)) {
    lines.push(`[tag] ${tag}`);
  }

  if (payload.metadata.launchExecutable.trim()) {
    lines.push(`[launch_executable] ${payload.metadata.launchExecutable.trim()}`);
  }

  for (const tag of payload.metadata.customTags) {
    const key = sanitizeKey(tag.key);
    if (!key) {
      continue;
    }

    lines.push(`[custom:${key}] ${tag.value}`);
  }

  lines.push('');
  await writeFile(nfoPath, lines.join('\n'), 'utf8');
}

export async function scanGameMedia(picturesPath: string): Promise<GameMediaAssets> {
  const assets: GameMediaAssets = {
    poster: null,
    card: null,
    background: null,
    screenshots: [],
  };

  try {
    const entries = await readdir(picturesPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !imageExtensions.has(path.extname(entry.name).toLowerCase())) {
        continue;
      }

      const stem = path.parse(entry.name).name.toLowerCase();
      const fullPath = path.join(picturesPath, entry.name);
      if (stem === 'poster') {
        assets.poster = fullPath;
      } else if (stem === 'card') {
        assets.card = fullPath;
      } else if (stem === 'background') {
        assets.background = fullPath;
      } else if (/^screen\d+$/i.test(stem)) {
        assets.screenshots.push(fullPath);
      }
    }
  } catch {
    return assets;
  }

  assets.screenshots.sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  return assets;
}

async function nextScreenshotIndex(picturesPath: string) {
  const assets = await scanGameMedia(picturesPath);
  return assets.screenshots.length + 1;
}

export async function importDroppedGameMedia(configPicturesFolderName: string, payload: ImportDroppedGameMediaPayload) {
  const picturesPath = path.join(payload.gamePath, configPicturesFolderName);
  await mkdir(picturesPath, { recursive: true });

  if (payload.target === 'screenshot') {
    let currentIndex = await nextScreenshotIndex(picturesPath);
    for (const filePath of payload.filePaths) {
      const extension = path.extname(filePath).toLowerCase();
      if (!imageExtensions.has(extension)) {
        continue;
      }

      const destination = path.join(picturesPath, `Screen${currentIndex}${extension}`);
      await copyFile(filePath, destination);
      currentIndex += 1;
    }
    return;
  }

  const existing = await readdir(picturesPath, { withFileTypes: true }).catch(() => []);
  for (const entry of existing) {
    if (entry.isFile() && path.parse(entry.name).name.toLowerCase() === payload.target) {
      await unlink(path.join(picturesPath, entry.name)).catch(() => undefined);
    }
  }

  const source = payload.filePaths[0];
  if (!source) {
    return;
  }

  const extension = path.extname(source).toLowerCase();
  if (!imageExtensions.has(extension)) {
    return;
  }

  await copyFile(source, path.join(picturesPath, `${payload.target}${extension}`));
}

export async function reorderScreenshots(fromPath: string, toPath: string) {
  const dir = path.dirname(fromPath);
  const tempPath = path.join(dir, `_swap_tmp_${Date.now()}${path.extname(fromPath)}`);
  await rename(fromPath, tempPath);
  await rename(toPath, fromPath);
  await rename(tempPath, toPath);
}

async function reindexScreenshotsInFolder(picturesPath: string) {
  const screenshots = (await scanGameMedia(picturesPath)).screenshots;
  const tempEntries: { tempPath: string; ext: string }[] = [];

  for (let index = 0; index < screenshots.length; index += 1) {
    const screenshotPath = screenshots[index];
    const ext = path.extname(screenshotPath);
    const tempPath = path.join(picturesPath, `_reindex_tmp_${Date.now()}_${index}${ext}`);
    await rename(screenshotPath, tempPath);
    tempEntries.push({ tempPath, ext });
  }

  for (let index = 0; index < tempEntries.length; index += 1) {
    const entry = tempEntries[index];
    await rename(entry.tempPath, path.join(picturesPath, `Screen${index + 1}${entry.ext}`));
  }
}

export async function removeScreenshot(screenshotPath: string) {
  const stem = path.parse(screenshotPath).name;
  if (!/^screen\d+$/i.test(stem)) {
    throw new Error('Only gallery screenshots can be removed.');
  }

  const picturesPath = path.dirname(screenshotPath);
  await unlink(screenshotPath);
  await reindexScreenshotsInFolder(picturesPath);
}