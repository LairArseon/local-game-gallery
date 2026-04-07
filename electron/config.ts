import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GalleryConfig } from '../src/types';

const defaultConfig: GalleryConfig = {
  gamesRoot: '',
  excludePatterns: ['.git', 'Thumbs.db'],
  hideDotEntries: true,
  versionFolderPattern: '^v\\d+\\.\\d+\\.\\d+\\.\\d+$',
  picturesFolderName: 'pictures',
  preferredViewMode: 'poster',
  posterColumns: 5,
  cardColumns: 4,
};

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

export async function loadConfig() {
  const configPath = getConfigPath();

  try {
    const fileContents = await readFile(configPath, 'utf8');
    return { ...defaultConfig, ...JSON.parse(fileContents) } as GalleryConfig;
  } catch {
    return defaultConfig;
  }
}

export async function saveConfig(config: GalleryConfig) {
  const normalizedConfig: GalleryConfig = {
    ...defaultConfig,
    ...config,
    excludePatterns: [...new Set(config.excludePatterns.map((pattern) => pattern.trim()).filter(Boolean))],
  };
  const configPath = getConfigPath();

  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(normalizedConfig, null, 2), 'utf8');

  return normalizedConfig;
}
