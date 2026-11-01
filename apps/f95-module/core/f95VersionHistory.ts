export type F95VersionHistoryEntry = {
  version: string;
  isLatest: boolean;
  changelog: string;
  releasedAt: string;
  datetime: string;
  timestamp: string;
  dateLabel: string;
  date: string;
  time: string;
  shortDate: string;
  dateTitle: string;
};

export type F95VersionHistory = {
  schemaVersion: 1;
  label: string;
  cadence: string;
  entries: F95VersionHistoryEntry[];
};

export function normalizeF95VersionLabel(version: string) {
  return version.trim().toLowerCase().replace(/^v(?=\d)/, '').replace(/\s+/g, ' ');
}

export function normalizeF95ReleaseDate(datetime: string, timestamp = '') {
  const normalizedDatetime = datetime.trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const parsedDatetime = normalizedDatetime ? Date.parse(normalizedDatetime) : NaN;
  if (Number.isFinite(parsedDatetime)) {
    return new Date(parsedDatetime).toISOString();
  }

  const parsedTimestamp = timestamp.trim() ? Number(timestamp) * 1000 : NaN;
  const date = new Date(parsedTimestamp);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

export function getLatestF95Release(history: F95VersionHistory | null) {
  if (!history?.entries.length) {
    return null;
  }

  return history.entries.find((entry) => entry.isLatest)
    ?? history.entries.filter((entry) => entry.releasedAt)
      .reduce<F95VersionHistoryEntry | null>((latest, entry) => (
        !latest || Date.parse(entry.releasedAt) > Date.parse(latest.releasedAt) ? entry : latest
      ), null)
    ?? history.entries[0];
}

export function parseF95VersionHistory(html: string): F95VersionHistory | null {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const strip = document.querySelector('.f95wg-thread .f95wg-strip');
  if (!strip) {
    return null;
  }

  const entries = Array.from(strip.querySelectorAll('.f95wg-strip-version')).flatMap((element) => {
    const versionElement = element.cloneNode(true) as Element;
    versionElement.querySelectorAll('.f95wg-muted, time').forEach((child) => child.remove());
    const version = versionElement.textContent?.trim() ?? '';
    if (!version) {
      return [];
    }

    const timeElement = element.querySelector('time');
    const datetime = timeElement?.getAttribute('datetime') ?? '';
    const timestamp = timeElement?.getAttribute('data-timestamp') ?? '';
    return [{
      version,
      isLatest: element.classList.contains('is-latest'),
      changelog: element.getAttribute('data-original-title') || element.getAttribute('title') || '',
      releasedAt: normalizeF95ReleaseDate(datetime, timestamp),
      datetime,
      timestamp,
      dateLabel: timeElement?.textContent?.trim() ?? '',
      date: timeElement?.getAttribute('data-date') ?? '',
      time: timeElement?.getAttribute('data-time') ?? '',
      shortDate: timeElement?.getAttribute('data-short') ?? '',
      dateTitle: timeElement?.getAttribute('title') ?? '',
    }];
  });

  return entries.length ? {
    schemaVersion: 1,
    label: strip.querySelector('.f95wg-strip-label')?.textContent?.trim() || 'Versions',
    cadence: strip.querySelector('.f95wg-strip-gap')?.textContent?.trim() ?? '',
    entries,
  } : null;
}

export function serializeF95VersionHistory(history: F95VersionHistory) {
  return JSON.stringify(history).replace(/\\\\|\\n/g, (escape) => escape === '\\\\' ? '\\u005c' : '\\u000a');
}

export function readStoredF95VersionHistory(value: string): F95VersionHistory | null {
  try {
    const history: unknown = JSON.parse(value);
    if (!history || typeof history !== 'object') {
      return null;
    }

    const record = history as Record<string, unknown>;
    if (record.schemaVersion !== 1 || typeof record.label !== 'string'
      || typeof record.cadence !== 'string' || !Array.isArray(record.entries)) {
      return null;
    }

    const stringFields = ['version', 'changelog', 'releasedAt', 'datetime', 'timestamp', 'dateLabel', 'date', 'time', 'shortDate', 'dateTitle'];
    if (!record.entries.length || !record.entries.every((entry: unknown) => {
      if (!entry || typeof entry !== 'object') {
        return false;
      }

      const fields = entry as Record<string, unknown>;
      return typeof fields.isLatest === 'boolean' && typeof fields.version === 'string'
        && Boolean(fields.version.trim()) && stringFields.every((field) => typeof fields[field] === 'string')
        && (!fields.releasedAt || Number.isFinite(Date.parse(fields.releasedAt as string)));
    })) {
      return null;
    }

    return history as F95VersionHistory;
  } catch {
    return null;
  }
}