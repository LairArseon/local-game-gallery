import { BellRing } from 'lucide-react';
import type { BuiltInModuleRenderContext } from '../../shared/app-shell/types/moduleHostTypes';
import { F95_THREAD_ID_TAG, F95_UP_TO_DATE_TAG, getF95BooleanTagValue, getF95TagValue } from '../core/f95Tags';

type F95GameUpdateBadgeProps = {
  context: BuiltInModuleRenderContext;
};

export function F95GameUpdateBadge({ context }: F95GameUpdateBadgeProps) {
  const threadId = getF95TagValue(context.moduleTags ?? [], F95_THREAD_ID_TAG);
  if (!threadId) {
    return null;
  }

  const isUpToDate = getF95BooleanTagValue(context.moduleTags ?? [], F95_UP_TO_DATE_TAG, true);
  const badgeClassName = `f95-presence-indicator${isUpToDate ? '' : ' f95-presence-indicator--pending'}`;
  const badgeLabel = isUpToDate ? 'F95 linked' : 'F95 linked, update available';

  return (
    <span className={badgeClassName} aria-label={badgeLabel} title={badgeLabel}>
      {!isUpToDate ? <BellRing size={12} aria-hidden="true" /> : null}
      <span>F95</span>
    </span>
  );
}