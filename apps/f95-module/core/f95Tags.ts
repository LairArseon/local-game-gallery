import type { ModuleHostGameTag, ModuleHostMetadataDraftLike } from '../../shared/app-shell/types/moduleHostTypes';

export const F95_THREAD_ID_TAG = 'module_f95_id';
export const F95_LAST_UPDATED_TAG = 'module_f95_last_updated';
export const F95_UP_TO_DATE_TAG = 'module_f95_up_to_date';
export const F95_THREAD_URL_TAG = 'module_f95_thread_url';
export const F95_CREATOR_TAG = 'module_f95_creator';
export const F95_LAST_UPDATE_TITLE_TAG = 'module_f95_last_update_title';
export const F95_LAST_FEED_ITEM_ID_TAG = 'module_f95_last_feed_item_id';

export function getF95TagValue(tags: ModuleHostGameTag[], key: string) {
  return tags.find((tag) => tag.key === key)?.value ?? '';
}

export function getF95BooleanTagValue(tags: ModuleHostGameTag[], key: string, defaultValue = false) {
  const value = getF95TagValue(tags, key).trim().toLowerCase();
  if (!value) {
    return defaultValue;
  }

  return value === 'true' || value === '1' || value === 'yes';
}

export function setF95TagValue(tags: ModuleHostGameTag[], key: string, value: string) {
  const normalizedValue = String(value ?? '').trim();
  const nextTags = tags.filter((tag) => tag.key !== key);
  if (!normalizedValue) {
    return nextTags;
  }

  return [...nextTags, { key, value: normalizedValue }];
}

export function updateF95MetadataDraft(
  metadataDraft: ModuleHostMetadataDraftLike,
  key: string,
  value: string,
): ModuleHostMetadataDraftLike {
  return {
    ...metadataDraft,
    customTags: setF95TagValue(metadataDraft.customTags, key, value),
  };
}

export function extractF95ThreadIdFromUrl(value: string) {
  const normalizedValue = String(value ?? '').trim();
  const match = normalizedValue.match(/\/threads\/(\d+)(?:[/?#]|$)/i);
  return match?.[1] ?? '';
}

export function normalizeF95ThreadUrl(value: string) {
  const normalizedValue = String(value ?? '').trim();
  if (!normalizedValue) {
    return '';
  }

  const threadId = extractF95ThreadIdFromUrl(normalizedValue);
  return threadId ? `https://f95zone.to/threads/${threadId}` : normalizedValue;
}

export function buildF95ThreadUrl(threadId: string) {
  const normalizedThreadId = String(threadId ?? '').trim();
  return normalizedThreadId ? `https://f95zone.to/threads/${normalizedThreadId}` : '';
}