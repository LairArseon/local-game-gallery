/**
 * Shared viewport-width tracker for narrow-layout mode.
 */
import { useEffect, useState } from 'react';

export function useNarrowViewport(maxWidthPx: number) {
  const [isNarrowViewport, setIsNarrowViewport] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= maxWidthPx : false
  ));

  useEffect(() => {
    const updateViewportMode = () => {
      setIsNarrowViewport(window.innerWidth <= maxWidthPx);
    };

    updateViewportMode();
    window.addEventListener('resize', updateViewportMode);

    return () => {
      window.removeEventListener('resize', updateViewportMode);
    };
  }, [maxWidthPx]);

  return isNarrowViewport;
}
