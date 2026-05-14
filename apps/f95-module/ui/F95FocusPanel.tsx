import type { BuiltInModuleRenderContext } from '../../shared/app-shell/types/moduleHostTypes';
import {
  F95_CREATOR_TAG,
  F95_LAST_UPDATED_TAG,
  F95_STARS_RATING_TAG,
  F95_THREAD_ID_TAG,
  F95_UP_TO_DATE_TAG,
  getF95BooleanTagValue,
  getF95TagValue,
} from '../core/f95Tags';
import { formatF95Rating, parseStoredF95Rating } from '../core/f95Rating';

type F95FocusPanelProps = {
  context: BuiltInModuleRenderContext;
};

function formatF95DateTime(value: string) {
  const normalizedValue = String(value ?? '').trim();
  if (!normalizedValue) {
    return '';
  }

  const parsedValue = Date.parse(normalizedValue);
  if (Number.isNaN(parsedValue)) {
    return normalizedValue;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsedValue);
}

export function F95FocusPanel({ context }: F95FocusPanelProps) {
  if (context.hostSurface === 'detail') {
    return null;
  }

  const moduleTags = context.moduleTags ?? [];
  const threadId = getF95TagValue(moduleTags, F95_THREAD_ID_TAG);
  const creator = getF95TagValue(moduleTags, F95_CREATOR_TAG);
  const lastUpdateAt = getF95TagValue(moduleTags, F95_LAST_UPDATED_TAG);
  const starsRating = getF95TagValue(moduleTags, F95_STARS_RATING_TAG);
  const isUpToDate = getF95BooleanTagValue(moduleTags, F95_UP_TO_DATE_TAG, true);
  const parsedRating = parseStoredF95Rating(starsRating);
  const formattedUpdatedAt = formatF95DateTime(lastUpdateAt);

  if (!threadId && !creator && !formattedUpdatedAt && parsedRating === null) {
    return null;
  }

  return (
    <div className="f95-focus-panel">
      <div className="f95-focus-panel__header">
        <strong>F95 Overview</strong>
        <span className={`f95-focus-panel__status ${isUpToDate ? 'f95-focus-panel__status--current' : 'f95-focus-panel__status--pending'}`}>
          {isUpToDate ? 'Up to date' : 'Update available'}
        </span>
      </div>
      <dl className="f95-focus-panel__grid">
        <div className="f95-focus-panel__field">
          <dt>ID</dt>
          <dd>{threadId || 'Not set'}</dd>
        </div>
        <div className="f95-focus-panel__field">
          <dt>Developer</dt>
          <dd>{creator || 'Not set'}</dd>
        </div>
        <div className="f95-focus-panel__field">
          <dt>Updated</dt>
          <dd>{formattedUpdatedAt || 'Not set'}</dd>
        </div>
        <div className="f95-focus-panel__field">
          <dt>F95 status</dt>
          <dd>{isUpToDate ? 'Up to date' : 'Update available'}</dd>
        </div>
        <div className="f95-focus-panel__field f95-focus-panel__field--wide">
          <dt>F95 score</dt>
          <dd>{parsedRating === null ? 'Not set' : `${formatF95Rating(parsedRating)}/5`}</dd>
        </div>
      </dl>
    </div>
  );
}