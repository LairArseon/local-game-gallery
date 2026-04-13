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
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import App from './App';
import { RenderErrorBoundary } from './components/RenderErrorBoundary';
import { GalleryClientProvider } from './client/context';
import { createGalleryClient } from './client/runtime';
import {
  discoverCompatibleServiceBaseUrl,
  probeServiceBaseUrl,
  rememberServiceBaseUrl,
  type WebServiceProbeResult,
} from './client/adapters/webClient';
import './i18n';
import './styles.css';

type WebClientScreenState = 'searching' | 'manual' | 'connecting' | 'ready';

type WebServiceBootstrapProps = {
  children: ReactNode;
};

function isDesktopRuntime() {
  return typeof window !== 'undefined' && 'gallery' in window;
}

function WebServiceBootstrap({ children }: WebServiceBootstrapProps) {
  const desktopRuntime = isDesktopRuntime();
  const [screenState, setScreenState] = useState<WebClientScreenState>(desktopRuntime ? 'ready' : 'searching');
  const [manualBackendUrl, setManualBackendUrl] = useState('http://127.0.0.1:37995');
  const [attempts, setAttempts] = useState<WebServiceProbeResult[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  async function runDiscovery() {
    if (desktopRuntime) {
      setScreenState('ready');
      return;
    }

    setConnectionError(null);
    setScreenState('searching');

    const discovery = await discoverCompatibleServiceBaseUrl();
    setAttempts(discovery.attempts);
    setManualBackendUrl(discovery.suggestedUrl);

    if (discovery.activeBackend) {
      rememberServiceBaseUrl(discovery.activeBackend.baseUrl);
      setScreenState('ready');
      return;
    }

    setScreenState('manual');
  }

  useEffect(() => {
    void runDiscovery();
  }, []);

  async function onConnectManualUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConnectionError(null);
    setScreenState('connecting');

    const result = await probeServiceBaseUrl(manualBackendUrl);
    setAttempts((current) => [result, ...current.filter((entry) => entry.baseUrl !== result.baseUrl)]);

    if (!result.compatible) {
      setConnectionError(result.reason ?? 'Backend is not compatible with this client.');
      setScreenState('manual');
      return;
    }

    rememberServiceBaseUrl(result.baseUrl);
    setManualBackendUrl(result.baseUrl);
    setScreenState('ready');
  }

  if (screenState === 'ready') {
    return <>{children}</>;
  }

  return (
    <main className="web-backend-shell">
      <section className="web-backend-panel">
        <p className="web-backend-eyebrow">Local Game Gallery</p>
        <h1 className="web-backend-title">Web Client</h1>

        {screenState === 'searching' ? (
          <p className="web-backend-status">Searching for a compatible backend...</p>
        ) : null}

        {screenState === 'manual' || screenState === 'connecting' ? (
          <form className="web-backend-form" onSubmit={(event) => {
            void onConnectManualUrl(event);
          }}>
            <label htmlFor="web-backend-url">Backend URL</label>
            <input
              id="web-backend-url"
              type="text"
              value={manualBackendUrl}
              onChange={(event) => {
                setManualBackendUrl(event.target.value);
              }}
              placeholder="http://127.0.0.1:37995"
              required
            />

            <div className="web-backend-actions">
              <button className="web-backend-button web-backend-button--primary" type="submit" disabled={screenState === 'connecting'}>
                {screenState === 'connecting' ? 'Connecting...' : 'Connect'}
              </button>
              <button
                className="web-backend-button"
                type="button"
                onClick={() => {
                  void runDiscovery();
                }}
                disabled={screenState === 'connecting'}
              >
                Retry discovery
              </button>
            </div>

            {connectionError ? <p className="web-backend-status web-backend-status--error">{connectionError}</p> : null}
          </form>
        ) : null}

        {attempts.length ? (
          <details className="web-backend-attempts">
            <summary>Discovery attempts</summary>
            <ul>
              {attempts.map((attempt, index) => (
                <li key={`${attempt.baseUrl || 'invalid'}-${index}`}>
                  <strong>{attempt.baseUrl || '(invalid URL)'}</strong>
                  <span>{attempt.compatible ? 'compatible' : attempt.reason ?? 'not compatible'}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    </main>
  );
}

const galleryClient = createGalleryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WebServiceBootstrap>
      <GalleryClientProvider client={galleryClient}>
        <RenderErrorBoundary>
          <App />
        </RenderErrorBoundary>
      </GalleryClientProvider>
    </WebServiceBootstrap>
  </React.StrictMode>,
);






