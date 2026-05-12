import type { BuiltInModuleRenderContext } from '../../shared/app-shell/types/moduleHostTypes';
import {
  F95_LAST_UPDATED_TAG,
  F95_LAST_UPDATE_TITLE_TAG,
  F95_THREAD_ID_TAG,
  getF95TagValue,
} from '../core/f95Tags';

type F95FocusPanelProps = {
  context: BuiltInModuleRenderContext;
};

export function F95FocusPanel({ context }: F95FocusPanelProps) {
  const moduleTags = context.moduleTags ?? [];
  const threadId = getF95TagValue(moduleTags, F95_THREAD_ID_TAG);
  const lastUpdateTitle = getF95TagValue(moduleTags, F95_LAST_UPDATE_TITLE_TAG);
  const lastUpdateAt = getF95TagValue(moduleTags, F95_LAST_UPDATED_TAG);

  if (!threadId && !lastUpdateTitle && !lastUpdateAt) {
    return null;
  }

  return (
    <div className="f95-focus-panel">
      <strong>F95</strong>
      {threadId ? <p>ID: {threadId}</p> : null}
      {lastUpdateTitle ? <p>Latest update: {lastUpdateTitle}</p> : null}
      {lastUpdateAt ? <p>Published: {lastUpdateAt}</p> : null}
    </div>
  );
}