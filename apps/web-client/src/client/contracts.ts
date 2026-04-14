/**
 * Transport-agnostic gallery client contracts used by renderer hooks/components.
 *
 * New to this project: this file defines the shared client boundary that lets
 * desktop, web, and mobile runtimes use the same feature hooks without direct
 * coupling to window.gallery or HTTP transport details.
 */
import type {
  GalleryApi,
  ServiceApiVersionInfo,
  ServiceCapabilities,
  ServiceHealthStatus,
} from '../types';

export type {
  ServiceApiVersionInfo,
  ServiceCapabilities,
  ServiceHealthStatus,
} from '../types';

export type GalleryClient = GalleryApi;
