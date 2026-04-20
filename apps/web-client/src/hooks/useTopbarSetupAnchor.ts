import { useEffect, useRef, useState, type RefObject } from 'react';

type UseTopbarSetupAnchorArgs = {
  isNarrowViewport: boolean;
};

type UseTopbarSetupAnchorResult = {
  topbarRef: RefObject<HTMLElement | null>;
  isTopbarCompact: boolean;
  useActionsOnlyCompactTopbar: boolean;
  topbarClassName: string;
};

export function useTopbarSetupAnchor({
  isNarrowViewport,
}: UseTopbarSetupAnchorArgs): UseTopbarSetupAnchorResult {
  const [isTopbarCompact, setIsTopbarCompact] = useState(false);
  const topbarRef = useRef<HTMLElement | null>(null);
  const isTopbarCompactRef = useRef(false);

  useEffect(() => {
    isTopbarCompactRef.current = isTopbarCompact;
  }, [isTopbarCompact]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let rafId: number | null = null;
    const compactEnterThreshold = 30;
    const compactExitThreshold = 14;

    const updateFromScroll = () => {
      const scrollY = window.scrollY;
      const nextCompact = isTopbarCompactRef.current
        ? scrollY > compactExitThreshold
        : scrollY > compactEnterThreshold;
      setIsTopbarCompact((current) => (current === nextCompact ? current : nextCompact));
    };

    const onScroll = () => {
      if (rafId !== null) {
        return;
      }

      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updateFromScroll();
      });
    };

    updateFromScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const useActionsOnlyCompactTopbar = isNarrowViewport && isTopbarCompact;
  const topbarClassName = `topbar panel ${isTopbarCompact ? 'topbar--compact' : ''} ${useActionsOnlyCompactTopbar ? 'topbar--actions-only' : ''}`;

  return {
    topbarRef,
    isTopbarCompact,
    useActionsOnlyCompactTopbar,
    topbarClassName,
  };
}
