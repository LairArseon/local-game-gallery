import type { GalleryClient } from './contracts';

export function createGalleryClientRuntime(electronClient: GalleryClient, webClient: GalleryClient): GalleryClient {
  if (typeof window !== 'undefined' && 'gallery' in window) {
    return electronClient;
  }

  return webClient;
}
