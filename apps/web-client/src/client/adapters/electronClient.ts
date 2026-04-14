/**
 * Desktop gallery client adapter backed by the Electron preload bridge.
 *
 * New to this project: this is the only renderer-side place that should talk
 * directly to window.gallery once hooks complete migration to useGalleryClient.
 */
import type { GalleryClient } from '../contracts';

export const electronClient: GalleryClient = window.gallery;
