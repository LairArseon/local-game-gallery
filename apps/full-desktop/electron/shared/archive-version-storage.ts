import { copyFile, cp, mkdtemp, mkdir, readdir, rm, stat, unlink } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import archiver from 'archiver';
import unzipper from 'unzipper';
import type { CompressGameVersionResult, DecompressGameVersionResult } from '../../src/types';

/**
 * Shared Electron archive and version-storage helpers.
 *
 * New to this project: this module contains side-effectful filesystem/archive
 * operations reused by both desktop IPC and HTTP service entry points.
 */

const versionStorageBaseName = 'storage_compresion';
const versionStorageArchivePattern = /^storage_compresion\.[^.]+$/i;
const versionMetadataFilePattern = /\.nfo$/i;

export type VersionStorageArchiveInfo = {
  archivePath: string;
  extension: string;
};

type VersionStorageLogEvent = {
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
};

type VersionStorageLogFn = (event: VersionStorageLogEvent) => Promise<void>;

export type VersionStorageProgressUpdate = {
  operation: 'compress' | 'decompress';
  phase: 'preparing' | 'compressing' | 'finalizing';
  percent: number;
  processedBytes?: number;
  totalBytes?: number;
};

type VersionStorageProgressFn = (update: VersionStorageProgressUpdate) => void;

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function toDownloadSafeFileName(value: string) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return 'download';
  }

  return normalized.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
}

function toAsciiHeaderFileName(value: string) {
  const normalized = toDownloadSafeFileName(value)
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/"/g, '_')
    .trim();

  return normalized || 'download';
}

export function buildAttachmentContentDisposition(fileName: string) {
  const safeName = toDownloadSafeFileName(fileName);
  const asciiFallback = toAsciiHeaderFileName(fileName);
  const encodedUtf8 = encodeURIComponent(safeName).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedUtf8}`;
}

export function toSafeFolderName(value: string, fallback: string) {
  const safe = toDownloadSafeFileName(value)
    .replace(/[. ]+$/g, '')
    .trim();

  return safe || fallback;
}

export function toDefaultImportMetadata(versionName: string) {
  return {
    latestVersion: versionName,
    score: '',
    status: '',
    description: '',
    notes: [] as string[],
    tags: [] as string[],
    launchExecutable: '',
    customTags: [] as Array<{ key: string; value: string }>,
  };
}

export function isPathInside(parentPath: string, targetPath: string) {
  const relative = path.relative(parentPath, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function createZipFromFolder(folderPath: string, outputZipPath: string) {
  await createZipFromFolderWithProgress(folderPath, outputZipPath);
}

export async function createZipFromFolderWithProgress(
  folderPath: string,
  outputZipPath: string,
  onProgress?: VersionStorageProgressFn,
) {
  await mkdir(path.dirname(outputZipPath), { recursive: true });
  await unlink(outputZipPath).catch(() => undefined);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      if (error) {
        reject(error);
        return;
      }

      resolve();
    };

    const output = createWriteStream(outputZipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => finish());
    output.on('error', (error) => finish(error));
    archive.on('error', (error) => finish(error));
    archive.on('progress', (event) => {
      const processedBytes = event.fs.processedBytes ?? 0;
      const totalBytes = event.fs.totalBytes ?? 0;
      const percent = totalBytes > 0 ? processedBytes / totalBytes : 0;
      onProgress?.({
        operation: 'compress',
        phase: 'compressing',
        percent: clampPercent(percent),
        processedBytes,
        totalBytes,
      });
    });

    archive.pipe(output);
    archive.directory(folderPath, false);
    void archive.finalize();
  });
}

export async function createZipFromEntriesWithProgress(
  basePath: string,
  entries: Array<{ name: string; isDirectory: boolean; isFile: boolean }>,
  outputZipPath: string,
  onProgress?: VersionStorageProgressFn,
) {
  await mkdir(path.dirname(outputZipPath), { recursive: true });
  await unlink(outputZipPath).catch(() => undefined);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      if (error) {
        reject(error);
        return;
      }

      resolve();
    };

    const output = createWriteStream(outputZipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => finish());
    output.on('error', (error) => finish(error));
    archive.on('error', (error) => finish(error));
    archive.on('progress', (event) => {
      const processedBytes = event.fs.processedBytes ?? 0;
      const totalBytes = event.fs.totalBytes ?? 0;
      const percent = totalBytes > 0 ? processedBytes / totalBytes : 0;
      onProgress?.({
        operation: 'compress',
        phase: 'compressing',
        percent: clampPercent(percent),
        processedBytes,
        totalBytes,
      });
    });

    archive.pipe(output);
    for (const entry of entries) {
      const sourcePath = path.join(basePath, entry.name);
      if (entry.isDirectory) {
        archive.directory(sourcePath, entry.name);
        continue;
      }

      if (entry.isFile) {
        archive.file(sourcePath, { name: entry.name });
      }
    }
    void archive.finalize();
  });
}

export async function extractZipToFolder(zipPath: string, outputFolderPath: string) {
  await extractZipToFolderWithProgress(zipPath, outputFolderPath);
}

export async function extractZipToFolderWithProgress(
  zipPath: string,
  outputFolderPath: string,
  onProgress?: VersionStorageProgressFn,
) {
  await rm(outputFolderPath, { recursive: true, force: true }).catch(() => undefined);
  await mkdir(outputFolderPath, { recursive: true });

  const directory = await unzipper.Open.file(zipPath);
  const fileEntries = directory.files.filter((entry) => entry.type !== 'Directory');
  const totalBytes = fileEntries.reduce((sum, entry) => {
    const entrySize = Number(entry.uncompressedSize ?? 0);
    return sum + (Number.isFinite(entrySize) ? Math.max(0, entrySize) : 0);
  }, 0);

  let processedBytes = 0;

  for (const entry of directory.files) {
    const relativePath = entry.path.replace(/\\/g, '/');
    const destinationPath = path.resolve(outputFolderPath, relativePath);
    if (!isPathInside(outputFolderPath, destinationPath)) {
      throw new Error(`Archive contains invalid path: "${entry.path}".`);
    }

    if (entry.type === 'Directory') {
      await mkdir(destinationPath, { recursive: true });
      continue;
    }

    await mkdir(path.dirname(destinationPath), { recursive: true });
    const readStream = entry.stream();
    readStream.on('data', (chunk: Buffer) => {
      processedBytes += chunk.length;
      const percent = totalBytes > 0 ? processedBytes / totalBytes : 0;
      onProgress?.({
        operation: 'decompress',
        phase: 'compressing',
        percent: clampPercent(percent),
        processedBytes,
        totalBytes,
      });
    });
    await pipeline(readStream, createWriteStream(destinationPath));
  }
}

export async function copyExtractedArchiveIntoVersion(extractedRootPath: string, targetVersionPath: string) {
  const extractedEntries = (await readdir(extractedRootPath, { withFileTypes: true }))
    .filter((entry) => entry.name !== '__MACOSX');

  if (!extractedEntries.length) {
    throw new Error('Archive does not contain importable files.');
  }

  let sourceRoot = extractedRootPath;
  if (extractedEntries.length === 1 && extractedEntries[0]?.isDirectory()) {
    sourceRoot = path.join(extractedRootPath, extractedEntries[0].name);
  }

  const existingEntries = await readdir(targetVersionPath).catch(() => []);
  if (existingEntries.length > 0) {
    throw new Error('Target version folder already contains files. Choose another version name.');
  }

  const entriesToCopy = await readdir(sourceRoot, { withFileTypes: true });
  for (const entry of entriesToCopy) {
    const sourcePath = path.join(sourceRoot, entry.name);
    const destinationPath = path.join(targetVersionPath, entry.name);
    if (entry.isDirectory()) {
      await cp(sourcePath, destinationPath, { recursive: true, force: true, errorOnExist: false });
      continue;
    }

    if (entry.isFile()) {
      await copyFile(sourcePath, destinationPath);
    }
  }
}

export async function resolveVersionStorageArchive(versionPath: string): Promise<VersionStorageArchiveInfo | null> {
  const entries = await readdir(versionPath, { withFileTypes: true }).catch(() => []);
  const archiveEntry = entries.find((entry) => entry.isFile() && versionStorageArchivePattern.test(entry.name));
  if (!archiveEntry) {
    return null;
  }

  const extension = path.extname(archiveEntry.name).replace('.', '').toLowerCase() || 'zip';
  return {
    archivePath: path.join(versionPath, archiveEntry.name),
    extension,
  };
}

export async function listRuntimeVersionEntries(versionPath: string) {
  const entries = await readdir(versionPath, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => {
    if (!(entry.isFile() || entry.isDirectory())) {
      return false;
    }

    if (versionStorageArchivePattern.test(entry.name)) {
      return false;
    }

    if (entry.isFile() && versionMetadataFilePattern.test(entry.name)) {
      return false;
    }

    return true;
  });
}

export async function compressVersionForStorage(
  gamePath: string,
  versionPath: string,
  versionName: string,
  source: string,
  appendLogEvent: VersionStorageLogFn,
  onProgress?: VersionStorageProgressFn,
): Promise<CompressGameVersionResult> {
  const resolvedGamePath = path.resolve(gamePath);
  const resolvedVersionPath = path.resolve(versionPath);

  if (!isPathInside(resolvedGamePath, resolvedVersionPath)) {
    throw new Error('Invalid version compression path.');
  }

  const versionStats = await stat(resolvedVersionPath).catch(() => null);
  if (!versionStats?.isDirectory()) {
    throw new Error('Selected version folder was not found on disk.');
  }

  const runtimeEntries = await listRuntimeVersionEntries(resolvedVersionPath);
  const existingArchive = await resolveVersionStorageArchive(resolvedVersionPath);

  if (!runtimeEntries.length && existingArchive) {
    const archiveStats = await stat(existingArchive.archivePath).catch(() => null);
    return {
      compressed: true,
      archivePath: existingArchive.archivePath,
      archiveSizeBytes: archiveStats?.size ?? 0,
      message: `${versionName} is already compressed.`,
    };
  }

  if (!runtimeEntries.length) {
    throw new Error('Version folder has no compressible files.');
  }

  const archiveExtension = existingArchive?.extension || 'zip';
  const archiveFileName = `${versionStorageBaseName}.${archiveExtension}`;
  const archiveOutputPath = path.join(resolvedVersionPath, archiveFileName);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'lgg-version-compress-'));
  const tempArchivePath = path.join(tempDir, archiveFileName);

  await appendLogEvent({
    level: 'info',
    source,
    message: `Compression requested for version "${versionName}" at "${resolvedVersionPath}" (${runtimeEntries.length} entries).`,
  }).catch(() => undefined);

  try {
    onProgress?.({ operation: 'compress', phase: 'preparing', percent: 0.02 });
    await appendLogEvent({
      level: 'info',
      source,
      message: `Preparing direct archive stream from "${resolvedVersionPath}" (${runtimeEntries.length} entries).`,
    }).catch(() => undefined);

    await appendLogEvent({
      level: 'info',
      source,
      message: `Starting archive creation to temporary path "${tempArchivePath}".`,
    }).catch(() => undefined);

    await createZipFromEntriesWithProgress(
      resolvedVersionPath,
      runtimeEntries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
      })),
      tempArchivePath,
      onProgress,
    );
    onProgress?.({ operation: 'compress', phase: 'finalizing', percent: 0.95 });
    await appendLogEvent({
      level: 'info',
      source,
      message: `Archive created at temporary path "${tempArchivePath}". Writing final archive to "${archiveOutputPath}".`,
    }).catch(() => undefined);
    await copyFile(tempArchivePath, archiveOutputPath);

    for (const entry of runtimeEntries) {
      const targetPath = path.join(resolvedVersionPath, entry.name);
      if (entry.isDirectory()) {
        await rm(targetPath, { recursive: true, force: true });
      } else {
        await unlink(targetPath).catch(() => undefined);
      }
    }

    const archiveStats = await stat(archiveOutputPath).catch(() => null);
    await appendLogEvent({
      level: 'info',
      source,
      message: `Compression completed for "${resolvedVersionPath}" -> "${archiveOutputPath}" (${archiveStats?.size ?? 0} bytes).`,
    }).catch(() => undefined);

    onProgress?.({ operation: 'compress', phase: 'finalizing', percent: 1 });

    return {
      compressed: true,
      archivePath: archiveOutputPath,
      archiveSizeBytes: archiveStats?.size ?? 0,
      message: `Compressed ${versionName}.`,
    };
  } catch (error) {
    const message = toErrorMessage(error, 'Unknown compression error.');
    await appendLogEvent({
      level: 'error',
      source,
      message: `Compression failed for "${resolvedVersionPath}": ${message}`,
    }).catch(() => undefined);
    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function decompressVersionFromStorage(
  gamePath: string,
  versionPath: string,
  versionName: string,
  source: string,
  appendLogEvent: VersionStorageLogFn,
  onProgress?: VersionStorageProgressFn,
): Promise<DecompressGameVersionResult> {
  const resolvedGamePath = path.resolve(gamePath);
  const resolvedVersionPath = path.resolve(versionPath);

  if (!isPathInside(resolvedGamePath, resolvedVersionPath)) {
    throw new Error('Invalid version decompression path.');
  }

  const versionStats = await stat(resolvedVersionPath).catch(() => null);
  if (!versionStats?.isDirectory()) {
    throw new Error('Selected version folder was not found on disk.');
  }

  const archiveInfo = await resolveVersionStorageArchive(resolvedVersionPath);
  if (!archiveInfo) {
    return {
      decompressed: true,
      extractedEntries: 0,
      message: `${versionName} is already decompressed.`,
    };
  }

  const existingRuntimeEntries = await listRuntimeVersionEntries(resolvedVersionPath);
  if (existingRuntimeEntries.length) {
    throw new Error('Version already has runtime files. Manual cleanup is required before decompression.');
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'lgg-version-decompress-'));
  const extractRoot = path.join(tempDir, 'extract');
  await appendLogEvent({
    level: 'info',
    source,
    message: `Decompression requested for version "${versionName}" from "${archiveInfo.archivePath}".`,
  }).catch(() => undefined);

  try {
    onProgress?.({ operation: 'decompress', phase: 'preparing', percent: 0.02 });
    await extractZipToFolderWithProgress(archiveInfo.archivePath, extractRoot, onProgress);
    onProgress?.({ operation: 'decompress', phase: 'finalizing', percent: 0.95 });
    const extractedEntries = (await readdir(extractRoot, { withFileTypes: true }))
      .filter((entry) => entry.name !== '__MACOSX');

    let sourceRoot = extractRoot;
    if (extractedEntries.length === 1 && extractedEntries[0]?.isDirectory()) {
      sourceRoot = path.join(extractRoot, extractedEntries[0].name);
    }

    const entriesToCopy = await readdir(sourceRoot, { withFileTypes: true });

    for (const entry of entriesToCopy) {
      const sourcePath = path.join(sourceRoot, entry.name);
      const destinationPath = path.join(resolvedVersionPath, entry.name);
      if (entry.isDirectory()) {
        await cp(sourcePath, destinationPath, { recursive: true, force: true, errorOnExist: false });
        continue;
      }

      if (entry.isFile()) {
        await copyFile(sourcePath, destinationPath);
      }
    }

    await unlink(archiveInfo.archivePath).catch(() => undefined);
    await appendLogEvent({
      level: 'info',
      source,
      message: `Decompression completed for "${resolvedVersionPath}" (${extractedEntries.length} extracted entries).`,
    }).catch(() => undefined);

    onProgress?.({ operation: 'decompress', phase: 'finalizing', percent: 1 });

    return {
      decompressed: true,
      extractedEntries: entriesToCopy.length,
      message: `Decompressed ${versionName}.`,
    };
  } catch (error) {
    const message = toErrorMessage(error, 'Unknown decompression error.');
    await appendLogEvent({
      level: 'error',
      source,
      message: `Decompression failed for "${resolvedVersionPath}": ${message}`,
    }).catch(() => undefined);
    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
