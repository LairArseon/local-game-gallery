import type {
  ServiceApiEnvelope,
  ServiceApiVersionInfo,
  ServiceCapabilities,
  ServiceHealthStatus,
} from './service-contracts';

const defaultServicePort = 37995;
const discoveryTimeoutMs = 2500;
const backendStorageKey = 'lgg.standalone.backend-url.v1';
const compatibleApiPrefix = 'http-v';

export type BackendProbeResult = {
  baseUrl: string;
  reachable: boolean;
  compatible: boolean;
  reason: string | null;
  apiVersion: ServiceApiVersionInfo | null;
  capabilities: ServiceCapabilities | null;
  health: ServiceHealthStatus | null;
  isSameDevice: boolean;
};

export type BackendDiscoveryResult = {
  activeBackend: BackendProbeResult | null;
  attempts: BackendProbeResult[];
  suggestedUrl: string;
};

function isLoopbackHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized === '[::1]';
}

function normalizeBaseUrl(rawBaseUrl: string) {
  const value = String(rawBaseUrl ?? '').trim();
  if (!value) {
    throw new Error('Backend URL is required.');
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Backend URL must be an absolute http:// or https:// URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Backend URL must use http:// or https://.');
  }

  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = '/';

  return parsed.toString().replace(/\/+$/, '');
}

function dedupeUrls(urls: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const url of urls) {
    if (!url || seen.has(url)) {
      continue;
    }

    seen.add(url);
    unique.push(url);
  }

  return unique;
}

function getStoredBackendUrl() {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return String(window.localStorage.getItem(backendStorageKey) ?? '').trim();
  } catch {
    return '';
  }
}

export function rememberBackendUrl(baseUrl: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(backendStorageKey, baseUrl);
  } catch {
    // Persistence is best-effort only.
  }
}

function getCandidateBackendUrls() {
  const candidates: string[] = [];

  const addCandidate = (candidate: string | undefined) => {
    const value = String(candidate ?? '').trim();
    if (!value) {
      return;
    }

    try {
      candidates.push(normalizeBaseUrl(value));
    } catch {
      // Ignore malformed candidates and keep discovery moving.
    }
  };

  addCandidate(getStoredBackendUrl());
  addCandidate(String(import.meta.env.VITE_GALLERY_SERVICE_URL ?? '').trim());

  const loopbackDefault = `http://127.0.0.1:${defaultServicePort}`;
  const localhostDefault = `http://localhost:${defaultServicePort}`;
  addCandidate(loopbackDefault);
  addCandidate(localhostDefault);

  if (typeof window !== 'undefined' && window.location.hostname) {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    addCandidate(`${protocol}//${window.location.hostname}:${defaultServicePort}`);
  }

  return dedupeUrls(candidates);
}

async function requestApi<TData>(baseUrl: string, routePath: string): Promise<TData> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, discoveryTimeoutMs);

  try {
    const response = await fetch(`${baseUrl}${routePath}`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    const textPayload = await response.text();
    let envelope: ServiceApiEnvelope<TData> | null = null;

    if (textPayload) {
      try {
        envelope = JSON.parse(textPayload) as ServiceApiEnvelope<TData>;
      } catch {
        throw new Error(`Service at ${baseUrl} returned non-JSON response.`);
      }
    }

    if (!response.ok) {
      if (envelope && !envelope.ok) {
        throw new Error(envelope.error.message);
      }

      throw new Error(`Service request failed with status ${response.status}.`);
    }

    if (!envelope || !envelope.ok) {
      throw new Error('Service response envelope is invalid.');
    }

    return envelope.data;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Timed out while contacting ${baseUrl}.`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function resolveSameDevice(baseUrl: string, health: ServiceHealthStatus | null) {
  try {
    const parsed = new URL(baseUrl);
    if (isLoopbackHost(parsed.hostname)) {
      return true;
    }

    if (health && isLoopbackHost(health.host)) {
      return true;
    }

    if (typeof window !== 'undefined' && window.location.hostname) {
      return window.location.hostname.trim().toLowerCase() === parsed.hostname.trim().toLowerCase();
    }

    return false;
  } catch {
    return false;
  }
}

export async function probeBackend(rawBaseUrl: string): Promise<BackendProbeResult> {
  let normalizedBaseUrl: string;
  try {
    normalizedBaseUrl = normalizeBaseUrl(rawBaseUrl);
  } catch (error) {
    return {
      baseUrl: String(rawBaseUrl ?? '').trim(),
      reachable: false,
      compatible: false,
      reason: error instanceof Error ? error.message : 'Invalid backend URL.',
      apiVersion: null,
      capabilities: null,
      health: null,
      isSameDevice: false,
    };
  }

  try {
    const [versionInfo, capabilities, health] = await Promise.all([
      requestApi<ServiceApiVersionInfo>(normalizedBaseUrl, '/api/version'),
      requestApi<ServiceCapabilities>(normalizedBaseUrl, '/api/capabilities'),
      requestApi<ServiceHealthStatus>(normalizedBaseUrl, '/api/health'),
    ]);

    const compatible = versionInfo.apiVersion.toLowerCase().startsWith(compatibleApiPrefix);
    const isSameDevice = resolveSameDevice(normalizedBaseUrl, health);

    return {
      baseUrl: normalizedBaseUrl,
      reachable: true,
      compatible,
      reason: compatible ? null : `Incompatible API version (${versionInfo.apiVersion}).`,
      apiVersion: versionInfo,
      capabilities,
      health,
      isSameDevice,
    };
  } catch (error) {
    return {
      baseUrl: normalizedBaseUrl,
      reachable: false,
      compatible: false,
      reason: error instanceof Error ? error.message : 'Unable to contact backend.',
      apiVersion: null,
      capabilities: null,
      health: null,
      isSameDevice: false,
    };
  }
}

export async function discoverCompatibleBackend(): Promise<BackendDiscoveryResult> {
  const candidates = getCandidateBackendUrls();
  const attempts: BackendProbeResult[] = [];

  for (const candidate of candidates) {
    const result = await probeBackend(candidate);
    attempts.push(result);

    if (result.compatible) {
      rememberBackendUrl(result.baseUrl);
      return {
        activeBackend: result,
        attempts,
        suggestedUrl: result.baseUrl,
      };
    }
  }

  return {
    activeBackend: null,
    attempts,
    suggestedUrl: candidates[0] ?? `http://127.0.0.1:${defaultServicePort}`,
  };
}
