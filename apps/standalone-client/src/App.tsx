import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { MonitorCog } from 'lucide-react';
import GalleryApp from '../../web-client/src/App';
import { RenderErrorBoundary } from '../../web-client/src/components/RenderErrorBoundary';
import { GalleryClientProvider } from '../../web-client/src/client/context';
import { createGalleryClient } from '../../web-client/src/client/runtime';
import { rememberServiceBaseUrl } from '../../web-client/src/client/adapters/webClient';
import {
  discoverCompatibleBackend,
  probeBackend,
  rememberBackendUrl,
  type BackendProbeResult,
} from './backend-discovery';
import '../../web-client/src/i18n';
import '../../web-client/src/styles.css';
import './styles.css';

type ClientScreenState = 'searching' | 'manual' | 'connecting' | 'connected';

type ConnectedStandaloneClientProps = {
  activeBackend: BackendProbeResult;
  onChangeBackend: () => void;
};

function ConnectedStandaloneClient({ activeBackend, onChangeBackend }: ConnectedStandaloneClientProps) {
  const galleryClient = useMemo(() => createGalleryClient(), []);

  useEffect(() => {
    rememberServiceBaseUrl(activeBackend.baseUrl);
  }, [activeBackend.baseUrl]);

  return (
    <div className="standalone-runtime-shell">
      <button
        className="standalone-backend-switch"
        type="button"
        onClick={onChangeBackend}
        aria-label="Change backend"
        title={`Connected to ${activeBackend.baseUrl}`}
      >
        <MonitorCog aria-hidden="true" />
      </button>
      <GalleryClientProvider client={galleryClient}>
        <RenderErrorBoundary>
          <GalleryApp />
        </RenderErrorBoundary>
      </GalleryClientProvider>
    </div>
  );
}

export default function App() {
  const [screenState, setScreenState] = useState<ClientScreenState>('searching');
  const [manualBackendUrl, setManualBackendUrl] = useState('http://127.0.0.1:37995');
  const [attempts, setAttempts] = useState<BackendProbeResult[]>([]);
  const [activeBackend, setActiveBackend] = useState<BackendProbeResult | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  async function runDiscovery() {
    setConnectionError(null);
    setScreenState('searching');

    const discovery = await discoverCompatibleBackend();
    setAttempts(discovery.attempts);
    setManualBackendUrl(discovery.suggestedUrl);

    if (discovery.activeBackend) {
      rememberServiceBaseUrl(discovery.activeBackend.baseUrl);
      setActiveBackend(discovery.activeBackend);
      setScreenState('connected');
      return;
    }

    setActiveBackend(null);
    setScreenState('manual');
  }

  useEffect(() => {
    void runDiscovery();
  }, []);

  async function onConnectManualUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConnectionError(null);
    setScreenState('connecting');

    const result = await probeBackend(manualBackendUrl);
    setAttempts((current) => [result, ...current.filter((entry) => entry.baseUrl !== result.baseUrl)]);

    if (!result.compatible) {
      setConnectionError(result.reason ?? 'Backend is not compatible with this client.');
      setScreenState('manual');
      return;
    }

    rememberBackendUrl(result.baseUrl);
    rememberServiceBaseUrl(result.baseUrl);
    setActiveBackend(result);
    setManualBackendUrl(result.baseUrl);
    setScreenState('connected');
  }

  const localFeatureHint = activeBackend?.isSameDevice
    ? 'Same-device backend detected. Host-local features can be enabled when backend policy allows it.'
    : 'Remote backend detected. Host-local features should remain disabled for this session.';

  if (screenState === 'connected' && activeBackend) {
    return (
      <ConnectedStandaloneClient
        activeBackend={activeBackend}
        onChangeBackend={() => {
          setActiveBackend(null);
          setScreenState('manual');
        }}
      />
    );
  }

  return (
    <main className="standalone-shell">
      <section className="standalone-panel">
        <p className="standalone-eyebrow">Local Game Gallery</p>
        <h1 className="standalone-title">Standalone Client</h1>

        {screenState === 'searching' ? (
          <p className="standalone-status-line">Searching for a compatible backend...</p>
        ) : null}

        {screenState === 'manual' || screenState === 'connecting' ? (
          <form className="standalone-connection-form" onSubmit={(event) => {
            void onConnectManualUrl(event);
          }}>
            <label htmlFor="backend-url">Backend URL</label>
            <input
              id="backend-url"
              type="url"
              value={manualBackendUrl}
              onChange={(event) => {
                setManualBackendUrl(event.target.value);
              }}
              placeholder="http://127.0.0.1:37995"
              required
            />
            <div className="standalone-action-row">
              <button className="standalone-button standalone-button--primary" type="submit" disabled={screenState === 'connecting'}>
                {screenState === 'connecting' ? 'Connecting...' : 'Connect'}
              </button>
              <button
                className="standalone-button"
                type="button"
                onClick={() => {
                  void runDiscovery();
                }}
                disabled={screenState === 'connecting'}
              >
                Retry discovery
              </button>
            </div>
            {connectionError ? <p className="standalone-status-line standalone-status-line--error">{connectionError}</p> : null}
            {activeBackend ? <p className="standalone-status-line">Last connected backend: {activeBackend.baseUrl}</p> : null}
            {activeBackend ? <p className="standalone-status-line">{localFeatureHint}</p> : null}
          </form>
        ) : null}

        {attempts.length ? (
          <details className="standalone-attempt-log">
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
