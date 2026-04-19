import type { GameSummary } from '../types';

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

export function normalizeTagRules(rules: string[]) {
  return rules.map((entry) => entry.trim()).filter(Boolean);
}

export function normalizeTagPool(pool: string[]) {
  const uniqueTags = new Map<string, string>();
  for (const tag of pool) {
    const normalized = tag.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (!uniqueTags.has(key)) {
      uniqueTags.set(key, normalized);
    }
  }

  return [...uniqueTags.values()].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}

export function normalizeMetadataTags(tags: string[]) {
  const uniqueTags = new Map<string, string>();
  for (const tag of tags) {
    const normalized = tag.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (!uniqueTags.has(key)) {
      uniqueTags.set(key, normalized);
    }
  }

  return [...uniqueTags.values()];
}

export function computeTagPoolUsage(pool: string[], games: GameSummary[]) {
  return Object.fromEntries(
    normalizeTagPool(pool).map((tag) => {
      const normalizedTag = tag.toLowerCase();
      const usage = games.reduce((count, game) => {
        const gameHasTag = game.metadata.tags.some((entry) => entry.trim().toLowerCase() === normalizedTag);
        return gameHasTag ? count + 1 : count;
      }, 0);

      return [tag, usage];
    }),
  );
}

export function normalizedScore(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function formatLastPlayed(value: string | null) {
  if (!value) {
    return 'Never';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatByteSize(value: number | null | undefined) {
  const normalized = Number(value ?? 0);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = normalized;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const decimals = unitIndex === 0 ? 0 : size < 10 ? 2 : 1;
  return `${size.toFixed(decimals)} ${units[unitIndex]}`;
}
