import { access, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GalleryConfig, GameSummary, ScanResult } from '../src/types';
import { createDefaultMetadata, getLatestVersionName, readGameMetadata, scanGameMedia } from './game-library';

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const defaultGameNfoName = 'game.nfo';
const defaultVersionNfoName = 'version.nfo';

async function pathExists(targetPath: string) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function defaultGameNfoTemplate(gameName: string) {
  const metadata = createDefaultMetadata('');
  return [
    '; Local Game Gallery metadata',
    `[title] ${gameName}`,
    `[latest_version] ${metadata.latestVersion}`,
    `[score] ${metadata.score}`,
    '[description] ',
    '[note] ',
    '',
  ].join('\n');
}

function defaultVersionNfoTemplate(versionName: string) {
  return [
    '; Version metadata',
    `[version] ${versionName}`,
    '[changes] Add notes for this version.',
    '[release_date] ',
    '',
  ].join('\n');
}

function matchesExcludePatterns(name: string, patterns: string[]) {
  return patterns.some((pattern) => name.toLowerCase() === pattern.toLowerCase());
}

async function hasNfoFile(folderPath: string) {
  const entries = await readdir(folderPath, { withFileTypes: true });
  return entries.some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.nfo'));
}

async function countImages(folderPath: string) {
  try {
    const entries = await readdir(folderPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase())).length;
  } catch {
    return 0;
  }
}

async function ensureDefaultGameNfo(gamePath: string, gameName: string) {
  const fallbackNfoPath = path.join(gamePath, defaultGameNfoName);
  const hasAnyNfo = await hasNfoFile(gamePath);

  if (hasAnyNfo) {
    return false;
  }

  await writeFile(fallbackNfoPath, defaultGameNfoTemplate(gameName), 'utf8');
  return true;
}

async function ensureDefaultVersionNfo(versionPath: string, versionName: string) {
  const fallbackNfoPath = path.join(versionPath, defaultVersionNfoName);
  const hasAnyNfo = await hasNfoFile(versionPath);

  if (hasAnyNfo) {
    return false;
  }

  await writeFile(fallbackNfoPath, defaultVersionNfoTemplate(versionName), 'utf8');
  return true;
}

export async function scanGames(config: GalleryConfig): Promise<ScanResult> {
  if (!config.gamesRoot) {
    throw new Error('Choose a games root folder before scanning.');
  }

  const rootStats = await stat(config.gamesRoot).catch(() => null);
  if (!rootStats?.isDirectory()) {
    throw new Error('The configured games root is not a valid folder.');
  }

  const versionPattern = new RegExp(config.versionFolderPattern);
  const warnings: string[] = [];
  const entries = await readdir(config.gamesRoot, { withFileTypes: true });
  const games: GameSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (config.hideDotEntries && entry.name.startsWith('.')) {
      continue;
    }

    if (matchesExcludePatterns(entry.name, config.excludePatterns)) {
      continue;
    }

    const gamePath = path.join(config.gamesRoot, entry.name);
    const gameEntries = await readdir(gamePath, { withFileTypes: true });
    const createdGameNfo = await ensureDefaultGameNfo(gamePath, entry.name);
    const versions = gameEntries
      .filter((child) => child.isDirectory() && versionPattern.test(child.name))
      .map((child) => ({
        name: child.name,
        path: path.join(gamePath, child.name),
        hasNfo: false,
      }));

    let createdVersionNfoCount = 0;
    for (const version of versions) {
      const createdVersionNfo = await ensureDefaultVersionNfo(version.path, version.name);
      createdVersionNfoCount += createdVersionNfo ? 1 : 0;
      version.hasNfo = true;
    }

    const picturesPath = path.join(gamePath, config.picturesFolderName);
    const hadPicturesFolder = await pathExists(picturesPath);
    if (!hadPicturesFolder) {
      await mkdir(picturesPath, { recursive: true });
    }
    const picturesStats = await stat(picturesPath).catch(() => null);
    const imageCount = picturesStats?.isDirectory() ? await countImages(picturesPath) : 0;
    const usesPlaceholderArt = imageCount === 0;
    const metadata = await readGameMetadata(gamePath, entry.name, versions);
    if (!metadata.latestVersion) {
      metadata.latestVersion = getLatestVersionName(versions);
    }
    const media = picturesStats?.isDirectory()
      ? await scanGameMedia(picturesPath)
      : { poster: null, card: null, background: null, screenshots: [] };

    games.push({
      name: entry.name,
      path: gamePath,
      hasNfo: true,
      picturesPath: picturesStats?.isDirectory() ? picturesPath : null,
      imageCount,
      usesPlaceholderArt,
      createdPicturesFolder: !hadPicturesFolder,
      createdGameNfo,
      createdVersionNfoCount,
      metadata,
      media,
      versionCount: versions.length,
      versions,
    });
  }

  if (!games.length) {
    warnings.push('The selected folder scanned successfully, but no game directories matched the current rules.');
  }

  games.sort((left, right) => left.name.localeCompare(right.name));

  return {
    rootPath: config.gamesRoot,
    scannedAt: new Date().toISOString(),
    games,
    warnings,
  };
}
