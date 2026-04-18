/**
 * Shared service-capabilities bootstrap effect.
 */
import { useEffect } from 'react';
import type {
  GalleryCapabilitiesClientLike,
  SetCapabilities,
} from '../types/appRuntimeTypes';

type UseServiceCapabilitiesLoaderArgs<TCapabilities> = {
  galleryClient: GalleryCapabilitiesClientLike<TCapabilities>;
  setServiceCapabilities: SetCapabilities<TCapabilities>;
};

export function useServiceCapabilitiesLoader<TCapabilities>({
  galleryClient,
  setServiceCapabilities,
}: UseServiceCapabilitiesLoaderArgs<TCapabilities>) {
  useEffect(() => {
    let isMounted = true;

    const loadServiceCapabilities = async () => {
      try {
        const capabilities = await galleryClient.getServiceCapabilities();
        if (isMounted) {
          setServiceCapabilities(capabilities);
        }
      } catch {
        // Keep fallback capability profile when service metadata cannot be loaded.
      }
    };

    void loadServiceCapabilities();

    return () => {
      isMounted = false;
    };
  }, [galleryClient, setServiceCapabilities]);
}

