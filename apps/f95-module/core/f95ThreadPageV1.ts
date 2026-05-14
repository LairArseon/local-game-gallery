import type { ModuleHostGameTag } from '../../shared/app-shell/types/moduleHostTypes';
import {
  buildF95ThreadUrl,
  F95_CREATOR_TAG,
  F95_LAST_UPDATED_TAG,
  F95_OVERVIEW_TAG,
  F95_STARS_RATING_TAG,
  F95_THREAD_TAGS_TAG,
  F95_THREAD_URL_TAG,
  F95_VERSION_TAG,
  F95_VOTE_COUNT_TAG,
  serializeF95TagList,
  setF95TagValue,
} from './f95Tags';
import { normalizeF95RatingString } from './f95Rating';

export type F95ThreadPageMetadata = {
  parserId: 'f95-thread-page-v1';
  threadId: string;
  threadUrl: string;
  title: string;
  overview: string;
  developer: string;
  version: string;
  threadUpdatedAt: string;
  starsRating: string;
  voteCount: string;
  tags: string[];
};

export type F95ThreadPageFetchStep =
  | 'resolve-thread-url'
  | 'request-thread-page'
  | 'read-thread-page'
  | 'parse-thread-page';

export class F95ThreadPageFetchError extends Error {
  readonly threadId: string;
  readonly step: F95ThreadPageFetchStep;
  readonly requestUrl: string;
  readonly responseUrl: string;
  readonly statusCode: number | null;
  readonly details: string;
  readonly causeValue: unknown;

  constructor(options: {
    message: string;
    threadId: string;
    step: F95ThreadPageFetchStep;
    requestUrl?: string;
    responseUrl?: string;
    statusCode?: number | null;
    details?: string;
    causeValue?: unknown;
  }) {
    super(options.message);
    this.name = 'F95ThreadPageFetchError';
    this.threadId = options.threadId;
    this.step = options.step;
    this.requestUrl = options.requestUrl ?? '';
    this.responseUrl = options.responseUrl ?? '';
    this.statusCode = options.statusCode ?? null;
    this.details = options.details ?? '';
    this.causeValue = options.causeValue;
  }
}

type JsonRecord = Record<string, unknown>;

const ARTICLE_BODY_STOP_LABELS = new Set([
  'Thread Updated:',
  'Release Date:',
  'Developer:',
  'Publisher:',
  'Censored:',
  'Version:',
  'OS:',
  'Language:',
  'Other Games:',
  'Genre:',
  'Installation:',
  'Changelog:',
  'Developer Notes:',
  'Downloads:',
  'Download:',
]);

function decodeHtmlEntities(value: string) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function stripHtml(value: string) {
  return decodeHtmlEntities(String(value ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function normalizeList(values: string[]) {
  const uniqueValues = new Map<string, string>();
  for (const value of values) {
    const normalizedValue = String(value ?? '').trim();
    if (!normalizedValue) {
      continue;
    }

    const key = normalizedValue.toLowerCase();
    if (!uniqueValues.has(key)) {
      uniqueValues.set(key, normalizedValue);
    }
  }

  return [...uniqueValues.values()];
}

function readCanonicalUrl(html: string) {
  const match = html.match(/<link\s+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  return match?.[1]?.trim() ?? '';
}

function readTitle(html: string) {
  const match = html.match(/<meta\s+property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
    ?? html.match(/<title>([\s\S]*?)<\/title>/i);
  return stripHtml(match?.[1] ?? '');
}

function readVisibleThreadTitle(html: string) {
  const match = html.match(/<h1\b[^>]*class=["'][^"']*p-title-value[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
  return stripHtml(match?.[1] ?? '');
}

function readDeveloperFromThreadTitle(title: string) {
  const normalizedTitle = String(title ?? '').trim();
  if (!normalizedTitle || !/\[[^\]]+\]\s*$/.test(normalizedTitle)) {
    return '';
  }

  const bracketMatches = [...normalizedTitle.matchAll(/\[([^\]]+)\]/g)];
  if (bracketMatches.length < 2) {
    return '';
  }

  return normalizeDeveloperName(bracketMatches[bracketMatches.length - 1]?.[1] ?? '');
}

function flattenJsonRecords(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenJsonRecords(entry));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const record = value as JsonRecord;
  return [record, ...Object.values(record).flatMap((entry) => flattenJsonRecords(entry))];
}

function readJsonLdRecords(html: string) {
  const matches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  const records: JsonRecord[] = [];

  for (const match of matches) {
    const scriptMatch = match.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    const rawJson = scriptMatch?.[1]?.trim();
    if (!rawJson) {
      continue;
    }

    try {
      records.push(...flattenJsonRecords(JSON.parse(rawJson)));
    } catch {
      continue;
    }
  }

  return records;
}

function normalizeStructuredText(value: string) {
  return decodeHtmlEntities(String(value ?? ''))
    .replace(/\\r/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/[\u2028\u2029]/g, '\n');
}

function isLabelLine(value: string) {
  const normalizedValue = String(value ?? '').trim();
  if (!normalizedValue) {
    return false;
  }

  if (/^[A-Za-z][A-Za-z0-9 '&()\-/.]+:$/.test(normalizedValue) || ARTICLE_BODY_STOP_LABELS.has(normalizedValue)) {
    return true;
  }

  for (const label of ARTICLE_BODY_STOP_LABELS) {
    if (normalizedValue.startsWith(`${label} `)) {
      return true;
    }
  }

  return false;
}

function readLabeledSection(lines: string[], label: string) {
  const startIndex = lines.findIndex((line) => line === label || line.startsWith(`${label} `));
  if (startIndex < 0) {
    return '';
  }

  const startLine = lines[startIndex];
  const inlineValue = startLine.slice(label.length).trim();
  if (inlineValue) {
    return inlineValue;
  }

  const collectedLines: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      if (collectedLines.length) {
        break;
      }

      continue;
    }

    if (isLabelLine(line)) {
      break;
    }

    collectedLines.push(line);
  }

  return collectedLines.join(' ').trim();
}

function normalizeDeveloperName(value: string) {
  const normalizedValue = String(value ?? '').trim();
  if (!normalizedValue) {
    return '';
  }

  return normalizedValue.split(/\s+-\s+/)[0]?.trim() ?? normalizedValue;
}

function readArticleBodyMetadata(html: string) {
  const jsonRecords = readJsonLdRecords(html);
  const threadRecord = jsonRecords.find((record) => typeof record.articleBody === 'string' || typeof record.headline === 'string');
  const ratingRecord = jsonRecords.find((record) => record.ratingValue !== undefined || record.ratingCount !== undefined || record.reviewCount !== undefined);
  const articleBody = normalizeStructuredText(typeof threadRecord?.articleBody === 'string' ? threadRecord.articleBody : '');
  const lines = articleBody.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const overview = readLabeledSection(lines, 'Overview:');
  const version = readLabeledSection(lines, 'Version:');
  const threadUpdatedAt = readLabeledSection(lines, 'Thread Updated:') || readLabeledSection(lines, 'Release Date:');

  return {
    title: typeof threadRecord?.headline === 'string' ? stripHtml(threadRecord.headline) : '',
    overview,
    developer: '',
    version,
    threadUpdatedAt,
    starsRating: String(ratingRecord?.ratingValue ?? '').trim(),
    bestRating: String(ratingRecord?.bestRating ?? '').trim(),
    voteCount: String(ratingRecord?.ratingCount ?? ratingRecord?.reviewCount ?? '').trim(),
  };
}

function readRatingFallbacks(html: string) {
  const ratingValueMatch = html.match(/ratingValue["']?\s*[:=]\s*["']?([0-9]+(?:\.[0-9]+)?)/i)
    ?? html.match(/([0-9]+(?:\.[0-9]+)?)\s*star\(s\)/i);
  const voteCountMatch = html.match(/ratingCount["']?\s*[:=]\s*["']?(\d+)/i)
    ?? html.match(/reviewCount["']?\s*[:=]\s*["']?(\d+)/i)
    ?? html.match(/from\s*(\d+)\s*votes?/i);

  return {
    starsRating: ratingValueMatch?.[1]?.trim() ?? '',
    bestRating: html.match(/bestRating["']?\s*[:=]\s*["']?([0-9]+(?:\.[0-9]+)?)/i)?.[1]?.trim() ?? '',
    voteCount: voteCountMatch?.[1]?.trim() ?? '',
  };
}

function readThreadTags(html: string) {
  const tagBlocks = [
    ...html.matchAll(/<span\b[^>]*class=["'][^"']*js-tagList[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi),
    ...html.matchAll(/<dl\b[^>]*class=["'][^"']*tagList[^"']*["'][^>]*>([\s\S]*?)<\/dl>/gi),
  ];

  const tagSources = tagBlocks.length
    ? tagBlocks.map((match) => match[1] ?? '')
    : [html];

  const extractedTags = tagSources.flatMap((source) => {
    const tagMatches = [...source.matchAll(/<a\b(?=[^>]*href=["'](?:https?:\/\/[^"']+)?\/?tags\/[^"']+["'])(?=[^>]*class=["'][^"']*tagItem[^"']*["'])[^>]*>([\s\S]*?)<\/a>/gi)];
    return tagMatches.map((match) => stripHtml(match[1] ?? ''));
  });

  return normalizeList(extractedTags);
}

/**
 * Dedicated parser for the current F95 XenForo thread layout.
 * Keep site-specific selectors and normalization here so future breakage stays localized.
 */
export const F95_THREAD_PAGE_V1_PARSER = {
  id: 'f95-thread-page-v1' as const,
  buildThreadUrl(threadId: string) {
    return buildF95ThreadUrl(threadId);
  },
  parse(threadId: string, html: string, finalUrl = ''): F95ThreadPageMetadata | null {
    const normalizedThreadId = String(threadId ?? '').trim();
    const source = String(html ?? '').trim();
    if (!normalizedThreadId || !source) {
      return null;
    }

    const articleMetadata = readArticleBodyMetadata(source);
    const ratingFallbacks = readRatingFallbacks(source);
    const canonicalUrl = readCanonicalUrl(source);
    const visibleThreadTitle = readVisibleThreadTitle(source);
    const fallbackTitle = readTitle(source);
    const developerFromTitle = readDeveloperFromThreadTitle(visibleThreadTitle || fallbackTitle || articleMetadata.title);

    return {
      parserId: 'f95-thread-page-v1',
      threadId: normalizedThreadId,
      threadUrl: canonicalUrl || String(finalUrl ?? '').trim() || buildF95ThreadUrl(normalizedThreadId),
      title: articleMetadata.title || visibleThreadTitle || fallbackTitle,
      overview: articleMetadata.overview,
      developer: developerFromTitle,
      version: articleMetadata.version,
      threadUpdatedAt: articleMetadata.threadUpdatedAt,
      starsRating: normalizeF95RatingString(
        articleMetadata.starsRating || ratingFallbacks.starsRating,
        articleMetadata.bestRating || ratingFallbacks.bestRating,
      ),
      voteCount: articleMetadata.voteCount || ratingFallbacks.voteCount,
      tags: readThreadTags(source),
    };
  },
};

function createFetchError(options: {
  message: string;
  threadId: string;
  step: F95ThreadPageFetchStep;
  requestUrl?: string;
  responseUrl?: string;
  statusCode?: number | null;
  details?: string;
  causeValue?: unknown;
}) {
  return new F95ThreadPageFetchError(options);
}

export function formatF95ThreadPageFetchError(error: unknown, fallback: string) {
  if (error instanceof F95ThreadPageFetchError) {
    const details = [
      fallback,
      `step=${error.step}`,
      `threadId=${error.threadId}`,
      error.statusCode !== null ? `status=${error.statusCode}` : '',
      error.requestUrl ? `requestUrl=${error.requestUrl}` : '',
      error.responseUrl ? `responseUrl=${error.responseUrl}` : '',
      error.message ? `message=${error.message}` : '',
      error.details ? `details=${error.details}` : '',
      error.causeValue instanceof Error ? `cause=${error.causeValue.message}` : '',
    ].filter(Boolean);
    return details.join(' | ');
  }

  if (error instanceof Error) {
    return `${fallback} | message=${error.message}`;
  }

  return fallback;
}

function describeStep(step: F95ThreadPageFetchStep) {
  switch (step) {
    case 'resolve-thread-url':
      return 'Resolving thread URL...';
    case 'request-thread-page':
      return 'Requesting thread page...';
    case 'read-thread-page':
      return 'Reading response body...';
    case 'parse-thread-page':
      return 'Parsing thread metadata...';
    default:
      return 'Fetching thread content...';
  }
}

export function getF95ThreadPageFetchStepLabel(step: F95ThreadPageFetchStep) {
  return describeStep(step);
}

export async function fetchF95ThreadPageMetadata(
  threadId: string,
  options?: {
    fetchImpl?: typeof fetch;
    onStepChange?: (step: F95ThreadPageFetchStep) => void;
  },
): Promise<F95ThreadPageMetadata | null> {
  const normalizedThreadId = String(threadId ?? '').trim();
  if (!normalizedThreadId) {
    return null;
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  const requestUrl = F95_THREAD_PAGE_V1_PARSER.buildThreadUrl(normalizedThreadId);

  options?.onStepChange?.('resolve-thread-url');
  options?.onStepChange?.('request-thread-page');

  let response: Response;
  try {
    response = await fetchImpl(requestUrl, {
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });
  } catch (error) {
    throw createFetchError({
      message: 'Failed to request the F95 thread page.',
      threadId: normalizedThreadId,
      step: 'request-thread-page',
      requestUrl,
      details: error instanceof Error ? error.message : '',
      causeValue: error,
    });
  }

  if (!response.ok) {
    throw createFetchError({
      message: 'F95 thread page request returned a non-success status.',
      threadId: normalizedThreadId,
      step: 'request-thread-page',
      requestUrl,
      responseUrl: response.url,
      statusCode: response.status,
      details: response.statusText,
    });
  }

  options?.onStepChange?.('read-thread-page');
  let html = '';
  try {
    html = await response.text();
  } catch (error) {
    throw createFetchError({
      message: 'Failed to read the F95 thread page response body.',
      threadId: normalizedThreadId,
      step: 'read-thread-page',
      requestUrl,
      responseUrl: response.url,
      statusCode: response.status,
      details: error instanceof Error ? error.message : '',
      causeValue: error,
    });
  }

  options?.onStepChange?.('parse-thread-page');
  const parsedMetadata = F95_THREAD_PAGE_V1_PARSER.parse(normalizedThreadId, html, response.url);
  if (!parsedMetadata) {
    throw createFetchError({
      message: 'The current F95 thread parser could not extract metadata from the response.',
      threadId: normalizedThreadId,
      step: 'parse-thread-page',
      requestUrl,
      responseUrl: response.url,
      statusCode: response.status,
    });
  }

  return parsedMetadata;
}

/**
 * Manual page-refresh helper. Keep this out of the gallery-wide refresh flow so
 * F95 thread scraping only runs when a user explicitly requests it for one game.
 */
export function applyF95ThreadPageMetadata(tags: ModuleHostGameTag[], metadata: F95ThreadPageMetadata) {
  let nextTags = tags;
  const nextEntries: Array<[string, string]> = [
    [F95_THREAD_URL_TAG, metadata.threadUrl],
    [F95_CREATOR_TAG, metadata.developer],
    [F95_LAST_UPDATED_TAG, metadata.threadUpdatedAt],
    [F95_OVERVIEW_TAG, metadata.overview],
    [F95_VERSION_TAG, metadata.version],
    [F95_STARS_RATING_TAG, metadata.starsRating],
    [F95_VOTE_COUNT_TAG, metadata.voteCount],
    [F95_THREAD_TAGS_TAG, serializeF95TagList(metadata.tags)],
  ];

  for (const [key, value] of nextEntries) {
    if (!String(value ?? '').trim()) {
      continue;
    }

    nextTags = setF95TagValue(nextTags, key, value);
  }

  return nextTags;
}