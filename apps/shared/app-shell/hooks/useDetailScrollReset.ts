/**
 * Scroll detail layout to top when entering narrow detail mode.
 */
import { useEffect } from 'react';

export function useDetailScrollReset(isNarrowViewport: boolean, detailGamePath: string | null) {
  useEffect(() => {
    if (!isNarrowViewport || !detailGamePath) {
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [detailGamePath, isNarrowViewport]);
}
