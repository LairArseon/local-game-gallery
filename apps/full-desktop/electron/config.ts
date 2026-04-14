/**
 * Persistent configuration load/save and normalization helpers.
 *
 * New to this project: start here for on-disk config defaults, normalization, and migration-compatible transforms before renderer state consumes settings.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GalleryConfig } from '../src/types';
import { resolveGalleryDataPath } from './runtime-paths';

const minUiScale = 0.75;
const maxUiScale = 1.5;
const minGlobalZoom = 0.75;
const maxGlobalZoom = 2;
const minMetadataGapScale = 0.5;
const maxMetadataGapScale = 4;
const vaultPinObfuscationPrefix = 'obf:v1:';
const vaultPinObfuscationKey = Buffer.from('local-game-gallery-vault-pin', 'utf8');

function obfuscateVaultPin(pin: string) {
  if (!pin) {
    return '';
  }

  const input = Buffer.from(pin, 'utf8');
  const output = Buffer.allocUnsafe(input.length);

  for (let index = 0; index < input.length; index += 1) {
    output[index] = input[index] ^ vaultPinObfuscationKey[index % vaultPinObfuscationKey.length];
  }

  return `${vaultPinObfuscationPrefix}${output.toString('base64')}`;
}

function deobfuscateVaultPin(value: string) {
  if (!value) {
    return '';
  }

  if (!value.startsWith(vaultPinObfuscationPrefix)) {
    // Backward compatibility with existing plain-text values.
    return value;
  }

  try {
    const encoded = value.slice(vaultPinObfuscationPrefix.length);
    const input = Buffer.from(encoded, 'base64');
    const output = Buffer.allocUnsafe(input.length);

    for (let index = 0; index < input.length; index += 1) {
      output[index] = input[index] ^ vaultPinObfuscationKey[index % vaultPinObfuscationKey.length];
    }

    return output.toString('utf8');
  } catch {
    return '';
  }
}

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

function normalizeMetadataGapScale(value: number | string | undefined, fallback = 1) {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(maxMetadataGapScale, Math.max(minMetadataGapScale, parsed));
}

const defaultConfig: GalleryConfig = {
  language: 'en',
  dismissedVersionMismatches: {},
  vaultedGamePaths: [],
  vaultPin: '',
  gamesRoot: '',
  metadataMirrorRoot: '',
  excludePatterns: ['.git', 'Thumbs.db'],
  hideDotEntries: true,
  versionFolderPattern: '^v\\d+\\.\\d+\\.\\d+\\.\\d+$',
  picturesFolderName: 'pictures',
  preferredViewMode: 'poster',
  posterColumns: 5,
  cardColumns: 4,
  uiBaseFontScale: 1,
  uiBaseSpacingScale: 1,
  uiMetadataGapScale: 1,
  uiDynamicGridScaling: false,
  uiGlobalZoom: 1,
  appIconPngPath: '',
  showSystemMenuBar: true,
  statusChoices: ['Backlog', 'Playing', 'Completed', 'On Hold', 'Dropped'],
  tagPool: [],
  tagPoolUsage: {},
  filterPresets: [],
};

async function getConfigPath() {
  const dataPath = await resolveGalleryDataPath();
  return path.join(dataPath, 'config.json');
}

export async function loadConfig() {
  const configPath = await getConfigPath();

  try {
    const fileContents = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(fileContents) as Partial<GalleryConfig>;
    const merged = { ...defaultConfig, ...parsed } as GalleryConfig;

    return {
      ...merged,
      vaultPin: deobfuscateVaultPin(String(parsed.vaultPin ?? merged.vaultPin ?? '').trim()),
    };
  } catch {
    return defaultConfig;
  }
}

export async function saveConfig(config: GalleryConfig) {
  const normalizedLanguage = config.language === 'es' ? 'es' : 'en';

  const normalizedConfig: GalleryConfig = {
    ...defaultConfig,
    ...config,
    language: normalizedLanguage,
    dismissedVersionMismatches: Object.fromEntries(
      Object.entries(config.dismissedVersionMismatches ?? {})
        .map(([gamePath, detectedVersion]) => [String(gamePath).trim(), String(detectedVersion ?? '').trim()])
        .filter(([gamePath, detectedVersion]) => gamePath && detectedVersion),
    ),
    vaultedGamePaths: [...new Set((config.vaultedGamePaths ?? []).map((gamePath) => String(gamePath).trim()).filter(Boolean))],
    vaultPin: String(config.vaultPin ?? '').trim(),
    metadataMirrorRoot: String(config.metadataMirrorRoot ?? '').trim(),
    excludePatterns: [...new Set(config.excludePatterns.map((pattern) => pattern.trim()).filter(Boolean))],
    statusChoices: [...new Set((config.statusChoices ?? []).map((value) => value.trim()).filter(Boolean))],
    tagPool: [...new Set((config.tagPool ?? []).map((value) => value.trim()).filter(Boolean))],
    showSystemMenuBar: Boolean(config.showSystemMenuBar),
    tagPoolUsage: Object.fromEntries(
      Object.entries(config.tagPoolUsage ?? {})
        .map(([tag, count]): [string, number] => [tag.trim(), Number.parseInt(String(count), 10)])
        .filter(([tag, count]) => tag && Number.isFinite(count) && count >= 0),
    ),
    uiBaseFontScale: normalizeUiScale(config.uiBaseFontScale, defaultConfig.uiBaseFontScale),
    uiBaseSpacingScale: normalizeUiScale(config.uiBaseSpacingScale, defaultConfig.uiBaseSpacingScale),
    uiMetadataGapScale: normalizeMetadataGapScale(config.uiMetadataGapScale, defaultConfig.uiMetadataGapScale),
    uiDynamicGridScaling: Boolean(config.uiDynamicGridScaling),
    uiGlobalZoom: normalizeGlobalZoom(config.uiGlobalZoom, defaultConfig.uiGlobalZoom),
    appIconPngPath: String(config.appIconPngPath ?? '').trim(),
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
  const configPath = await getConfigPath();
  const persistedConfig: GalleryConfig = {
    ...normalizedConfig,
    // Convenience-level obfuscation so the PIN is not obvious in plain text.
    vaultPin: obfuscateVaultPin(normalizedConfig.vaultPin),
  };

  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(persistedConfig, null, 2), 'utf8');

  return normalizedConfig;
}






