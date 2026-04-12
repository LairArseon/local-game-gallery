/**
 * Renderer entry point.
 *
 * Boots React, applies global styles, and wraps the app in a
 * render error boundary to avoid blank-screen failures.
 *
 * New to this project: this file is the renderer bootstrap boundary; it mounts App, imports i18n/styles, and wraps with the render error boundary.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { RenderErrorBoundary } from './components/RenderErrorBoundary';
import './i18n';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RenderErrorBoundary>
      <App />
    </RenderErrorBoundary>
  </React.StrictMode>,
);






