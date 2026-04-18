/**
 * Renderer entry point.
 *
 * Boots React, applies global styles, and wraps the app in a
 * render error boundary to avoid blank-screen failures.
 *
 * New to this project: this file is the renderer bootstrap boundary; it mounts App, imports i18n/styles, and wraps with the render error boundary.
 */
import React from 'react';
import { renderAppRoot } from '../../shared/app-shell/main/renderAppRoot';
import App from './App';
import { RenderErrorBoundary } from './components/RenderErrorBoundary';
import { GalleryClientProvider } from './client/context';
import { createGalleryClient } from './client/runtime';
import './i18n';
import './styles.css';

const galleryClient = createGalleryClient();

renderAppRoot({
  app: (
    <GalleryClientProvider client={galleryClient}>
      <RenderErrorBoundary>
        <App />
      </RenderErrorBoundary>
    </GalleryClientProvider>
  ),
});






