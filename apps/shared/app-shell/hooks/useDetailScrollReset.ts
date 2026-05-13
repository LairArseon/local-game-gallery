/**
 * Scroll detail layout to top when entering a detail view.
 */
import { useEffect } from 'react';

export function useDetailScrollReset(isNarrowViewport: boolean, detailGamePath: string | null) {
  useEffect(() => {
    if (!detailGamePath) {
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [detailGamePath, isNarrowViewport]);
}
