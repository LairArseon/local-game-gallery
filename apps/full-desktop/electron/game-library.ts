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
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif']);
const retryableFsErrorCodes = new Set(['EBUSY', 'EPERM', 'EACCES']);

function isRetryableFsError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === 'string' && retryableFsErrorCodes.has(code);
}

function waitFor(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withFsRetry<T>(operation: () => Promise<T>, maxAttempts = 8) {
  let attempt = 0;

  while (attempt < maxAttempts) {
    try {
      return await operation();
    } catch (error) {
      attempt += 1;

      if (!isRetryableFsError(error) || attempt >= maxAttempts) {
        throw error;
      }

      await waitFor(Math.min(80 * attempt, 1000));
    }
  }

  throw new Error('Filesystem retry exhausted.');
}

async function renameWithRetry(fromPath: string, toPath: string, maxAttempts = 24) {
  await withFsRetry(() => rename(fromPath, toPath), maxAttempts);
}

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
  const fromStemMatch = path.parse(fromPath).name.match(/^screen(\d+)$/i);
  const toStemMatch = path.parse(toPath).name.match(/^screen(\d+)$/i);
  if (!fromStemMatch || !toStemMatch) {
    throw new Error('Only gallery screenshots can be reordered.');
  }

  const picturesPath = path.dirname(fromPath);
  if (path.dirname(toPath) !== picturesPath) {
    throw new Error('Screenshots must be in the same pictures folder.');
  }

  const fromIndex = Number.parseInt(fromStemMatch[1] ?? '', 10);
  const toIndex = Number.parseInt(toStemMatch[1] ?? '', 10);
  if (!Number.isFinite(fromIndex) || !Number.isFinite(toIndex) || fromIndex <= 0 || toIndex <= 0) {
    throw new Error('Invalid screenshot index for reorder.');
  }

  if (fromIndex === toIndex) {
    return;
  }

  const screenshots = (await scanGameMedia(picturesPath)).screenshots;
  const resolveScreenshotPathByIndex = (index: number) => screenshots.find((candidatePath) => {
    const stem = path.parse(candidatePath).name;
    const match = stem.match(/^screen(\d+)$/i);
    return Number.parseInt(match?.[1] ?? '', 10) === index;
  });

  const resolvedFromPath = resolveScreenshotPathByIndex(fromIndex);
  const resolvedToPath = resolveScreenshotPathByIndex(toIndex);
  if (!resolvedFromPath || !resolvedToPath) {
    throw new Error('Screenshot file was not found for reorder.');
  }

  if (resolvedFromPath.toLowerCase() === resolvedToPath.toLowerCase()) {
    return;
  }

  const fromExt = path.extname(resolvedFromPath);
  const toExt = path.extname(resolvedToPath);
  const targetFromPath = path.join(picturesPath, `Screen${fromIndex}${toExt}`);
  const targetToPath = path.join(picturesPath, `Screen${toIndex}${fromExt}`);
  const tempPath = path.join(picturesPath, `_swap_tmp_${Date.now()}_${Math.random().toString(16).slice(2)}${fromExt}`);

  await renameWithRetry(resolvedFromPath, tempPath);

  try {
    await renameWithRetry(resolvedToPath, targetFromPath);
    await renameWithRetry(tempPath, targetToPath);
  } catch (error) {
    // If any step fails, attempt rollback and surface the original error.
    await renameWithRetry(tempPath, resolvedFromPath).catch(() => undefined);
    throw error;
  }
}

async function reindexScreenshotsInFolder(picturesPath: string) {
  const screenshots = (await scanGameMedia(picturesPath)).screenshots;
  const tempEntries: { tempPath: string; ext: string }[] = [];

  for (let index = 0; index < screenshots.length; index += 1) {
    const screenshotPath = screenshots[index];
    const ext = path.extname(screenshotPath);
    const tempPath = path.join(picturesPath, `_reindex_tmp_${Date.now()}_${index}${ext}`);
    await renameWithRetry(screenshotPath, tempPath);
    tempEntries.push({ tempPath, ext });
  }

  for (let index = 0; index < tempEntries.length; index += 1) {
    const entry = tempEntries[index];
    await renameWithRetry(entry.tempPath, path.join(picturesPath, `Screen${index + 1}${entry.ext}`));
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