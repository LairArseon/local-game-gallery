export type ParsedGalleryLogEntry = {
  id: string;
  timestamp: string;
  epochMs: number;
  level: 'info' | 'warn' | 'error';
  source: string;
  moduleId: string | null;
  message: string;
  rawLine: string;
};

const moduleSourcePattern = /^module:([^/\s]+)(?:[\/](.+))?$/i;
const logEntryPattern = /^\[(.+?)\]\s+\[(INFO|WARN|ERROR)\]\s+\[(.+?)\]\s+(.*)$/;

export function createModuleLogSource(moduleId: string, scope?: string) {
  const normalizedModuleId = String(moduleId).trim().toLowerCase();
  const normalizedScope = String(scope ?? '').trim().toLowerCase();
  if (!normalizedModuleId) {
    return 'module:unknown';
  }

  return normalizedScope ? `module:${normalizedModuleId}/${normalizedScope}` : `module:${normalizedModuleId}`;
}

export function inferModuleIdFromLogSource(source: string) {
  const normalizedSource = String(source ?? '').trim();
  const match = normalizedSource.match(moduleSourcePattern);
  return match?.[1] ? match[1].toLowerCase() : null;
}

export function parseGalleryLogContents(logContents: string): ParsedGalleryLogEntry[] {
  return String(logContents ?? '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line, index) => {
      const match = line.match(logEntryPattern);
      if (!match) {
        return {
          id: `raw:${index}`,
          timestamp: '',
          epochMs: Number.NaN,
          level: 'info' as const,
          source: 'app',
          moduleId: null,
          message: line,
          rawLine: line,
        };
      }

      const [, timestamp, rawLevel, source, message] = match;
      const epochMs = Number.isFinite(Date.parse(timestamp)) ? Date.parse(timestamp) : Number.NaN;
      const level = rawLevel.toLowerCase() as ParsedGalleryLogEntry['level'];
      return {
        id: `${timestamp}:${source}:${index}`,
        timestamp,
        epochMs,
        level,
        source,
        moduleId: inferModuleIdFromLogSource(source),
        message,
        rawLine: line,
      };
    });
}