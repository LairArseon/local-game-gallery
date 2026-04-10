import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GalleryConfig } from '../src/types';

const minUiScale = 0.75;
const maxUiScale = 1.5;
const minGlobalZoom = 0.75;
const maxGlobalZoom = 2;

function normalizeUiScale(value: number | string | undefined, fallback = 1) {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(maxUiScale, Math.max(minUiScale, parsed));
}

function normalizeGlobalZoom(value: number | string | undefined, fallback = 1) {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(maxGlobalZoom, Math.max(minGlobalZoom, parsed));
}

const defaultConfig: GalleryConfig = {
  gamesRoot: '',
  excludePatterns: ['.git', 'Thumbs.db'],
  hideDotEntries: true,
  versionFolderPattern: '^v\\d+\\.\\d+\\.\\d+\\.\\d+$',
  picturesFolderName: 'pictures',
  preferredViewMode: 'poster',
  posterColumns: 5,
  cardColumns: 4,
  uiBaseFontScale: 1,
  uiBaseSpacingScale: 1,
  uiDynamicGridScaling: false,
  uiGlobalZoom: 1,
  statusChoices: ['Backlog', 'Playing', 'Completed', 'On Hold', 'Dropped'],
  filterPresets: [],
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
    statusChoices: [...new Set((config.statusChoices ?? []).map((value) => value.trim()).filter(Boolean))],
    uiBaseFontScale: normalizeUiScale(config.uiBaseFontScale, defaultConfig.uiBaseFontScale),
    uiBaseSpacingScale: normalizeUiScale(config.uiBaseSpacingScale, defaultConfig.uiBaseSpacingScale),
    uiDynamicGridScaling: Boolean(config.uiDynamicGridScaling),
    uiGlobalZoom: normalizeGlobalZoom(config.uiGlobalZoom, defaultConfig.uiGlobalZoom),
    filterPresets: (config.filterPresets ?? [])
      .map((preset) => ({
        ...preset,
        name: preset.name.trim(),
        tagRules: preset.tagRules.map((rule) => rule.trim()).filter(Boolean),
        minScore: String(preset.minScore ?? '').trim(),
        status: String(preset.status ?? '').trim(),
      }))
      .filter((preset) => preset.name),
  };
  const configPath = getConfigPath();

  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(normalizedConfig, null, 2), 'utf8');

  return normalizedConfig;
}
