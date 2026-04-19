import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';

type ZoomConfigLike = {
  uiGlobalZoom?: number;
};

type UseGlobalShortcutsArgs<TConfig extends ZoomConfigLike> = {
  setConfig: Dispatch<SetStateAction<TConfig | null>>;
  searchInputRef: RefObject<HTMLInputElement | null>;
  isScanning: boolean;
  onRefreshRequest: () => Promise<unknown>;
  screenshotModalPath: string | null;
  setScreenshotModalPath: Dispatch<SetStateAction<string | null>>;
  clamp: (value: number, min: number, max: number) => number;
  isTypingTarget: (target: EventTarget | null) => boolean;
};

export function useGlobalShortcuts<TConfig extends ZoomConfigLike>({
  setConfig,
  searchInputRef,
  isScanning,
  onRefreshRequest,
  screenshotModalPath,
  setScreenshotModalPath,
  clamp,
  isTypingTarget,
}: UseGlobalShortcutsArgs<TConfig>) {
  useEffect(() => {
    const updateGlobalZoom = (nextZoom: number) => {
      setConfig((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          uiGlobalZoom: clamp(nextZoom, 0.75, 2),
        };
      });
    };

    const adjustGlobalZoom = (delta: number) => {
      setConfig((current) => {
        if (!current) {
          return current;
        }

        const configuredZoom = current.uiGlobalZoom ?? 1;
        const currentZoom = Number.isFinite(configuredZoom) ? configuredZoom : 1;
        const nextZoom = Math.round((currentZoom + delta) * 100) / 100;
        return {
          ...current,
          uiGlobalZoom: clamp(nextZoom, 0.75, 2),
        };
      });
    };

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) {
        return;
      }

      event.preventDefault();
      adjustGlobalZoom(event.deltaY < 0 ? 0.05 : -0.05);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      const normalizedKey = key.toLowerCase();
      const ctrlOrMetaPressed = event.ctrlKey || event.metaKey;
      const canUsePlainPlusMinus = !event.altKey && !ctrlOrMetaPressed && !isTypingTarget(event.target);

      if (ctrlOrMetaPressed && normalizedKey === '0') {
        event.preventDefault();
        updateGlobalZoom(1);
        return;
      }

      const isZoomInKey = key === '+' || key === '=' || normalizedKey === 'numpadadd';
      const isZoomOutKey = key === '-' || key === '_' || normalizedKey === 'numpadsubtract';

      if ((ctrlOrMetaPressed || canUsePlainPlusMinus) && isZoomInKey) {
        event.preventDefault();
        adjustGlobalZoom(0.05);
        return;
      }

      if ((ctrlOrMetaPressed || canUsePlainPlusMinus) && isZoomOutKey) {
        event.preventDefault();
        adjustGlobalZoom(-0.05);
      }
    };

    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    window.addEventListener('keydown', onKeyDown, { capture: true });

    return () => {
      window.removeEventListener('wheel', onWheel, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [clamp, isTypingTarget, setConfig]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isFindShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f';
      if (!isFindShortcut) {
        return;
      }

      event.preventDefault();
      const input = searchInputRef.current;
      if (!input) {
        return;
      }

      input.focus();
      input.select();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [searchInputRef]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'F5') {
        return;
      }

      event.preventDefault();
      if (isScanning) {
        return;
      }

      void onRefreshRequest();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isScanning, onRefreshRequest]);

  useEffect(() => {
    if (!screenshotModalPath) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setScreenshotModalPath(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [screenshotModalPath, setScreenshotModalPath]);
}
