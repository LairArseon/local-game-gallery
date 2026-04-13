/**
 * Runtime selection helpers for choosing the active gallery client adapter.
 *
 * New to this project: desktop resolves to Electron preload bridge,
 * while non-Electron runtimes fall back to the web adapter scaffold.
 */
import type { GalleryClient } from './contracts';
import { electronClient } from './adapters/electronClient';
import { webClient } from './adapters/webClient';

export function createGalleryClient(): GalleryClient {
  if (typeof window !== 'undefined' && 'gallery' in window) {
    return electronClient;
  }

  return webClient;
}
