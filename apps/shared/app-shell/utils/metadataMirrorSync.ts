import type { MetadataMirrorSyncPolicy } from '../types';

export const metadataMirrorSyncIntervalPattern = /^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/;

export function parseMetadataMirrorSyncInterval(value: string) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return null;
  }

  const match = metadataMirrorSyncIntervalPattern.exec(normalized);
  if (!match) {
    return null;
  }

  const days = Number.parseInt(match[1] ?? '0', 10);
  const hours = Number.parseInt(match[2] ?? '0', 10);
  const minutes = Number.parseInt(match[3] ?? '0', 10);
  const seconds = Number.parseInt(match[4] ?? '0', 10);

  if (![days, hours, minutes, seconds].every(Number.isFinite)) {
    return null;
  }

  const totalMilliseconds = (
    (days * 24 * 60 * 60)
    + (hours * 60 * 60)
    + (minutes * 60)
    + seconds
  ) * 1000;

  if (totalMilliseconds <= 0) {
    return null;
  }

  return {
    days,
    hours,
    minutes,
    seconds,
    totalMilliseconds,
  };
}

export function normalizeMetadataMirrorSyncPolicy(value: string | undefined): MetadataMirrorSyncPolicy {
  switch (String(value ?? '').trim()) {
    case 'scheduled':
      return 'scheduled';
    case 'never':
      return 'never';
    default:
      return 'on-refresh';
  }
}

export function normalizeMetadataMirrorSyncInterval(value: string | undefined) {
  const normalized = String(value ?? '').trim();
  return parseMetadataMirrorSyncInterval(normalized) ? normalized : '';
}

export function normalizeLastMetadataMirrorSyncAt(value: string | undefined) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return '';
  }

  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
}

export function shouldSyncMetadataMirrorOnExplicitRefresh({
  policy,
  interval,
  lastSyncedAt,
}: {
  policy: MetadataMirrorSyncPolicy;
  interval: string;
  lastSyncedAt: string;
}) {
  if (policy === 'never') {
    return false;
  }

  if (policy === 'on-refresh') {
    return true;
  }

  const parsedInterval = parseMetadataMirrorSyncInterval(interval);
  if (!parsedInterval) {
    return false;
  }

  const lastSyncedAtMs = Date.parse(String(lastSyncedAt ?? '').trim());
  if (!Number.isFinite(lastSyncedAtMs)) {
    return true;
  }

  return (Date.now() - lastSyncedAtMs) >= parsedInterval.totalMilliseconds;
}