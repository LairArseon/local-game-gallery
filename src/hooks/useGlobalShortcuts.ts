/**
 * Registers app-wide input shortcuts and related global interaction effects.
 *
 * This hook handles zoom controls (wheel and key variants), find focus shortcut,
 * manual refresh keybinding, and screenshot lightbox escape close behavior.
 * Keeping these listeners centralized prevents duplicated window event wiring
 * and guarantees proper cleanup when component state changes.
 *
 * New to this project: this hook registers global keyboard/mouse shortcuts; follow event listeners here to understand zoom/find/refresh/escape behavior.
 */
import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { GalleryConfig } from '../types';
import { clamp, isTypingTarget } from '../utils/app-helpers';

type UseGlobalShortcutsArgs = {
  setConfig: Dispatch<SetStateAction<GalleryConfig | null>>;
  searchInputRef: RefObject<HTMLInputElement | null>;
  isScanning: boolean;
  refreshScan: () => Promise<unknown>;
  screenshotModalPath: string | null;
  setScreenshotModalPath: Dispatch<SetStateAction<string | null>>;
};

export function useGlobalShortcuts({
  setConfig,
  searchInputRef,
  isScanning,
  refreshScan,
  screenshotModalPath,
  setScreenshotModalPath,
}: UseGlobalShortcutsArgs) {
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

        const currentZoom = Number.isFinite(current.uiGlobalZoom) ? current.uiGlobalZoom : 1;
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

      // Use non-passive wheel handling so Ctrl+wheel maps to app zoom, not page zoom.
      event.preventDefault();
      adjustGlobalZoom(event.deltaY < 0 ? 0.05 : -0.05);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      const normalizedKey = key.toLowerCase();
      const ctrlOrMetaPressed = event.ctrlKey || event.metaKey;
      // Allow plain +/- only when user is not typing in an input-like control.
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

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [setConfig]);

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
      // Ignore repeated refresh triggers while a scan is already running.
      if (isScanning) {
        return;
      }

      void refreshScan();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isScanning, refreshScan]);

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






