import type { BuiltInModuleRenderContext } from '../../shared/app-shell/types/moduleHostTypes';
import { F95_UP_TO_DATE_TAG, getF95BooleanTagValue } from '../core/f95Tags';

type F95GameUpdateBadgeProps = {
  context: BuiltInModuleRenderContext;
};

export function F95GameUpdateBadge({ context }: F95GameUpdateBadgeProps) {
  const isUpToDate = getF95BooleanTagValue(context.moduleTags ?? [], F95_UP_TO_DATE_TAG, true);
  if (isUpToDate) {
    return null;
  }

  return <span className="f95-update-indicator">F95 update</span>;
}