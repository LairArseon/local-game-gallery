import type { GalleryClient } from './contracts';
import { electronClient } from './adapters/electronClient';
import { webClient } from './adapters/webClient';
import { createGalleryClientRuntime } from '../../../shared/app-shell/client/runtimeCore';

export function createGalleryClient(): GalleryClient {
  return createGalleryClientRuntime(electronClient, webClient);
}
