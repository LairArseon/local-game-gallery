import { access, copyFile, mkdir, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GalleryConfig, GameSummary, ScanRequestOptions, ScanResult } from '../src/types';
import { createDefaultMetadata, getLatestVersionName, readGameMetadata, scanGameMedia } from './game-library';
import { appendLogEvent } from './logger';

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const defaultGameNfoName = 'game.nfo';
const defaultVersionNfoName = 'version.nfo';
const activityLogFileName = 'activitylog';

type MirrorSyncStats = {
  syncedGames: number;
  prunedGames: number;
  nfoCopied: number;
  nfoSkipped: number;
  nfoDeleted: number;
  imageCopied: number;
  imageSkipped: number;
  imageDeleted: number;
};

type MirrorPicturesSyncOptions = {
  pruneMissingImages: boolean;
};

async function pathExists(targetPath: string) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readDirectoryEntriesSafe(folderPath: string) {
  try {
    return await readdir(folderPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function createMirrorSyncStats(): MirrorSyncStats {
  return {
    syncedGames: 0,
    prunedGames: 0,
    nfoCopied: 0,
    nfoSkipped: 0,
    nfoDeleted: 0,
    imageCopied: 0,
    imageSkipped: 0,
    imageDeleted: 0,
  };
}

async function logScanEvent(message: string, level: 'info' | 'warn' | 'error' = 'info') {
  await appendLogEvent({
    message,
    level,
    source: 'scan-sync',
  }).catch(() => undefined);
}

function isPathInside(parentPath: string, targetPath: string) {
  const relative = path.relative(parentPath, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function getMirrorRootValidationError(sourceRootPath: string, mirrorRootPath: string) {
  if (sourceRootPath === mirrorRootPath) {
    return 'Metadata mirror root matches games root, so mirror sync/fallback is disabled.';
  }

  if (isPathInside(sourceRootPath, mirrorRootPath) || isPathInside(mirrorRootPath, sourceRootPath)) {
    return 'Metadata mirror root overlaps games root. Choose a separate non-overlapping folder.';
  }

  return '';
}

async function shouldCopyFile(sourcePath: string, targetPath: string) {
  const sourceStats = await stat(sourcePath).catch(() => null);
  if (!sourceStats?.isFile()) {
    return false;
  }

  const targetStats = await stat(targetPath).catch(() => null);
  if (!targetStats?.isFile()) {
    return true;
  }

  if (sourceStats.size !== targetStats.size) {
    return true;
  }

  return sourceStats.mtimeMs > targetStats.mtimeMs;
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

async function readLastPlayedAt(gamePath: string) {
  const activityLogPath = path.join(gamePath, activityLogFileName);
  try {
    const contents = await readFile(activityLogPath, 'utf8');
    const lines = contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.length ? lines[lines.length - 1] ?? null : null;
  } catch {
    return null;
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

async function syncNfoFiles(sourceFolderPath: string, mirrorFolderPath: string, stats: MirrorSyncStats) {
  await mkdir(mirrorFolderPath, { recursive: true });

  const sourceEntries = await readDirectoryEntriesSafe(sourceFolderPath);
  const sourceNfoNames = new Set(
    sourceEntries
      .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.nfo')
      .map((entry) => entry.name),
  );

  const mirrorEntries = await readDirectoryEntriesSafe(mirrorFolderPath);
  for (const mirrorEntry of mirrorEntries) {
    if (!mirrorEntry.isFile() || path.extname(mirrorEntry.name).toLowerCase() !== '.nfo') {
      continue;
    }

    if (sourceNfoNames.has(mirrorEntry.name)) {
      continue;
    }

    await unlink(path.join(mirrorFolderPath, mirrorEntry.name)).catch(() => undefined);
    stats.nfoDeleted += 1;
  }

  for (const sourceNfoName of sourceNfoNames) {
    const sourceNfoPath = path.join(sourceFolderPath, sourceNfoName);
    const mirrorNfoPath = path.join(mirrorFolderPath, sourceNfoName);
    if (await shouldCopyFile(sourceNfoPath, mirrorNfoPath)) {
      await copyFile(sourceNfoPath, mirrorNfoPath);
      stats.nfoCopied += 1;
    } else {
      stats.nfoSkipped += 1;
    }
  }
}

async function syncPicturesFolder(
  sourcePicturesPath: string,
  mirrorPicturesPath: string,
  stats: MirrorSyncStats,
  options: MirrorPicturesSyncOptions,
) {
  await mkdir(mirrorPicturesPath, { recursive: true });

  const sourceEntries = await readDirectoryEntriesSafe(sourcePicturesPath);
  const sourceImageNames = new Set(
    sourceEntries
      .filter((entry) => entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => entry.name),
  );

  if (options.pruneMissingImages) {
    const mirrorEntries = await readDirectoryEntriesSafe(mirrorPicturesPath);
    for (const mirrorEntry of mirrorEntries) {
      if (!mirrorEntry.isFile() || !imageExtensions.has(path.extname(mirrorEntry.name).toLowerCase())) {
        continue;
      }

      if (sourceImageNames.has(mirrorEntry.name)) {
        continue;
      }

      await unlink(path.join(mirrorPicturesPath, mirrorEntry.name)).catch(() => undefined);
      stats.imageDeleted += 1;
    }
  }

  for (const sourceImageName of sourceImageNames) {
    const sourceImagePath = path.join(sourcePicturesPath, sourceImageName);
    const mirrorImagePath = path.join(mirrorPicturesPath, sourceImageName);
    if (await shouldCopyFile(sourceImagePath, mirrorImagePath)) {
      await copyFile(sourceImagePath, mirrorImagePath);
      stats.imageCopied += 1;
    } else {
      stats.imageSkipped += 1;
    }
  }
}

async function syncMirrorGameContent(
  sourceGamePath: string,
  mirrorGamePath: string,
  versionNames: string[],
  versionPattern: RegExp,
  picturesFolderName: string,
  mirrorParitySync: boolean,
  stats: MirrorSyncStats,
) {
  stats.syncedGames += 1;
  await mkdir(mirrorGamePath, { recursive: true });
  await syncNfoFiles(sourceGamePath, mirrorGamePath, stats);

  const sourceVersionNames = new Set(versionNames);
  for (const versionName of sourceVersionNames) {
    const sourceVersionPath = path.join(sourceGamePath, versionName);
    const mirrorVersionPath = path.join(mirrorGamePath, versionName);
    await syncNfoFiles(sourceVersionPath, mirrorVersionPath, stats);
  }

  const mirrorGameEntries = await readDirectoryEntriesSafe(mirrorGamePath);
  for (const mirrorEntry of mirrorGameEntries) {
    if (!mirrorEntry.isDirectory()) {
      continue;
    }

    if (!versionPattern.test(mirrorEntry.name)) {
      continue;
    }

    if (sourceVersionNames.has(mirrorEntry.name)) {
      continue;
    }

    await rm(path.join(mirrorGamePath, mirrorEntry.name), { recursive: true, force: true });
  }

  await syncPicturesFolder(
    path.join(sourceGamePath, picturesFolderName),
    path.join(mirrorGamePath, picturesFolderName),
    stats,
    { pruneMissingImages: mirrorParitySync },
  );
}

async function pruneStaleMirrorGames(
  mirrorRootPath: string,
  sourceGameNames: Set<string>,
  config: GalleryConfig,
  stats: MirrorSyncStats,
) {
  const mirrorEntries = await readDirectoryEntriesSafe(mirrorRootPath);

  for (const mirrorEntry of mirrorEntries) {
    if (!mirrorEntry.isDirectory()) {
      continue;
    }

    if (config.hideDotEntries && mirrorEntry.name.startsWith('.')) {
      continue;
    }

    if (matchesExcludePatterns(mirrorEntry.name, config.excludePatterns)) {
      continue;
    }

    if (sourceGameNames.has(mirrorEntry.name)) {
      continue;
    }

    await rm(path.join(mirrorRootPath, mirrorEntry.name), { recursive: true, force: true });
    stats.prunedGames += 1;
  }
}

export async function scanGames(config: GalleryConfig, requestOptions: ScanRequestOptions = {}): Promise<ScanResult> {
  const configuredGamesRoot = String(config.gamesRoot ?? '').trim();
  if (!configuredGamesRoot) {
    throw new Error('Choose a games root folder before scanning.');
  }

  const shouldSyncMirror = requestOptions.syncMirror !== false;
  const mirrorParitySync = shouldSyncMirror && requestOptions.mirrorParity === true;

  const sourceRootPath = path.resolve(configuredGamesRoot);
  const configuredMirrorRoot = String(config.metadataMirrorRoot ?? '').trim();
  const mirrorRootPath = configuredMirrorRoot ? path.resolve(configuredMirrorRoot) : '';
  const warnings: string[] = [];
  const mirrorSyncStats = createMirrorSyncStats();
  const scanStartedAtMs = Date.now();

  let createdGameNfoCount = 0;
  let createdVersionNfoTotal = 0;
  let createdPicturesFolderCount = 0;

  await logScanEvent(
    `Scan started (gamesRoot="${sourceRootPath}", mirrorRoot="${mirrorRootPath || 'disabled'}", sync=${shouldSyncMirror ? 'enabled' : 'disabled'}, parity=${mirrorParitySync ? 'full' : 'safe-media-preserve'}).`,
    'info',
  );

  const mirrorValidationError = mirrorRootPath
    ? getMirrorRootValidationError(sourceRootPath, mirrorRootPath)
    : '';
  if (mirrorValidationError) {
    warnings.push(mirrorValidationError);
    await logScanEvent(mirrorValidationError, 'warn');
  }

  const sourceRootStats = await stat(sourceRootPath).catch(() => null);
  const canScanSourceRoot = Boolean(sourceRootStats?.isDirectory());

  let scanRootPath = sourceRootPath;
  let usingMirrorFallback = false;
  let mirrorSyncRootPath: string | null = null;

  if (canScanSourceRoot) {
    if (mirrorRootPath && !mirrorValidationError && shouldSyncMirror) {
      try {
        await mkdir(mirrorRootPath, { recursive: true });
        mirrorSyncRootPath = mirrorRootPath;
        await logScanEvent(`Metadata mirror sync enabled at "${mirrorRootPath}".`, 'info');
      } catch (error) {
        warnings.push(`Failed preparing metadata mirror root "${mirrorRootPath}": ${toErrorMessage(error, 'unknown error')}`);
      }
    } else if (mirrorRootPath && !mirrorValidationError) {
      await logScanEvent('Metadata mirror sync skipped (scan-only request).', 'info');
    }
  } else if (mirrorRootPath && !mirrorValidationError) {
    const mirrorRootStats = await stat(mirrorRootPath).catch(() => null);
    if (!mirrorRootStats?.isDirectory()) {
      throw new Error('The configured games root is not a valid folder, and the metadata mirror root is not a valid folder.');
    }

    scanRootPath = mirrorRootPath;
    usingMirrorFallback = true;
    warnings.push(`Primary games root is unavailable. Browsing metadata mirror at "${mirrorRootPath}".`);
    await logScanEvent(`Primary games root unavailable. Using metadata mirror fallback at "${mirrorRootPath}".`, 'warn');
  } else if (mirrorRootPath && mirrorValidationError) {
    throw new Error(`The configured games root is not a valid folder, and metadata mirror fallback is unavailable: ${mirrorValidationError}`);
  } else {
    throw new Error('The configured games root is not a valid folder.');
  }

  const versionPattern = new RegExp(config.versionFolderPattern);
  const entries = await readdir(scanRootPath, { withFileTypes: true });
  const games: GameSummary[] = [];
  const vaultedGamePaths = new Set(config.vaultedGamePaths ?? []);
  const sourceGameNames = new Set<string>();

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

    const gamePath = path.join(scanRootPath, entry.name);
    const sourceEquivalentGamePath = usingMirrorFallback
      ? path.join(sourceRootPath, entry.name)
      : gamePath;
    const gameEntries = await readDirectoryEntriesSafe(gamePath);
    const createdGameNfo = await ensureDefaultGameNfo(gamePath, entry.name);
    createdGameNfoCount += createdGameNfo ? 1 : 0;
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
    createdVersionNfoTotal += createdVersionNfoCount;

    if (mirrorSyncRootPath) {
      sourceGameNames.add(entry.name);

      try {
        await syncMirrorGameContent(
          gamePath,
          path.join(mirrorSyncRootPath, entry.name),
          versions.map((version) => version.name),
          versionPattern,
          config.picturesFolderName,
          mirrorParitySync,
          mirrorSyncStats,
        );
      } catch (error) {
        warnings.push(`Failed syncing metadata mirror for "${entry.name}": ${toErrorMessage(error, 'unknown error')}`);
      }
    }

    const picturesPath = path.join(gamePath, config.picturesFolderName);
    const hadPicturesFolder = await pathExists(picturesPath);
    if (!hadPicturesFolder) {
      await mkdir(picturesPath, { recursive: true });
      createdPicturesFolderCount += 1;
    }
    const picturesStats = await stat(picturesPath).catch(() => null);
    const imageCount = picturesStats?.isDirectory() ? await countImages(picturesPath) : 0;
    const usesPlaceholderArt = imageCount === 0;
    const metadata = await readGameMetadata(gamePath, entry.name, versions);
    const detectedLatestVersion = getLatestVersionName(versions);
    if (!metadata.latestVersion) {
      metadata.latestVersion = detectedLatestVersion;
    }
    const hasVersionMismatch = Boolean(
      detectedLatestVersion
      && metadata.latestVersion
      && detectedLatestVersion !== metadata.latestVersion,
    );
    const dismissedDetectedVersion = config.dismissedVersionMismatches?.[gamePath]
      ?? (usingMirrorFallback ? config.dismissedVersionMismatches?.[sourceEquivalentGamePath] : undefined);
    const isVersionMismatchDismissed = hasVersionMismatch
      && dismissedDetectedVersion === detectedLatestVersion;
    const media = picturesStats?.isDirectory()
      ? await scanGameMedia(picturesPath)
      : { poster: null, card: null, background: null, screenshots: [] };
    const lastPlayedAt = await readLastPlayedAt(gamePath);

    games.push({
      name: entry.name,
      path: gamePath,
      isVaulted: vaultedGamePaths.has(gamePath)
        || (usingMirrorFallback && vaultedGamePaths.has(sourceEquivalentGamePath)),
      lastPlayedAt,
      hasNfo: true,
      picturesPath: picturesStats?.isDirectory() ? picturesPath : null,
      imageCount,
      usesPlaceholderArt,
      createdPicturesFolder: !hadPicturesFolder,
      createdGameNfo,
      createdVersionNfoCount,
      metadata,
      detectedLatestVersion,
      hasVersionMismatch,
      isVersionMismatchDismissed,
      media,
      versionCount: versions.length,
      versions,
    });
  }

  if (mirrorSyncRootPath) {
    try {
      await pruneStaleMirrorGames(mirrorSyncRootPath, sourceGameNames, config, mirrorSyncStats);
    } catch (error) {
      warnings.push(`Failed pruning stale mirror games: ${toErrorMessage(error, 'unknown error')}`);
    }
  }

  if (!games.length) {
    warnings.push('The selected folder scanned successfully, but no game directories matched the current rules.');
  }

  games.sort((left, right) => left.name.localeCompare(right.name));

  const elapsedMs = Date.now() - scanStartedAtMs;
  await logScanEvent(
    `Scan completed in ${elapsedMs}ms (games=${games.length}, warnings=${warnings.length}, `
      + `createdGameNfo=${createdGameNfoCount}, createdVersionNfo=${createdVersionNfoTotal}, `
      + `createdPicturesFolders=${createdPicturesFolderCount}, mirrorSyncedGames=${mirrorSyncStats.syncedGames}, `
      + `mirrorNfoCopied=${mirrorSyncStats.nfoCopied}, mirrorNfoSkipped=${mirrorSyncStats.nfoSkipped}, `
      + `mirrorNfoDeleted=${mirrorSyncStats.nfoDeleted}, mirrorImagesCopied=${mirrorSyncStats.imageCopied}, `
      + `mirrorImagesSkipped=${mirrorSyncStats.imageSkipped}, mirrorImagesDeleted=${mirrorSyncStats.imageDeleted}, `
      + `mirrorPrunedGames=${mirrorSyncStats.prunedGames}, mode=${usingMirrorFallback ? 'mirror-fallback' : 'primary-root'}, `
      + `sync=${shouldSyncMirror ? 'enabled' : 'disabled'}, parity=${mirrorParitySync ? 'full' : 'safe-media-preserve'}).`,
    warnings.length ? 'warn' : 'info',
  );

  for (const warning of warnings) {
    await logScanEvent(warning, 'warn');
  }

  return {
    rootPath: scanRootPath,
    scannedAt: new Date().toISOString(),
    games,
    warnings,
    usingMirrorFallback,
  };
}
