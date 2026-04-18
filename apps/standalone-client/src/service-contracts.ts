export type ClientMode = 'desktop' | 'web' | 'mobile';

export type LaunchPolicy = 'host-desktop-only';

export type ServiceCapabilities = {
  supportsLaunch: boolean;
  launchPolicy: LaunchPolicy;
  supportsNativeContextMenu: boolean;
  supportsTrayLifecycle: boolean;
  clientMode: ClientMode;
  isContainerized: boolean;
  isGamesRootEditable: boolean;
};

export type ServiceHealthStatus = {
  status: 'ok' | 'degraded' | 'starting';
  startedAt: string;
  host: string;
  port: number;
  transport: 'ipc' | 'http';
};

export type ServiceApiVersionInfo = {
  apiVersion: string;
  serviceName: string;
  serviceBuild: string;
};

export type ServiceApiSuccess<TData> = {
  ok: true;
  data: TData;
};

export type ServiceApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

export type ServiceApiEnvelope<TData> = ServiceApiSuccess<TData> | ServiceApiError;
