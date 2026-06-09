export type LaunchIsolationRequest = {
  enabled: boolean;
  gameName: string;
  gamePath: string;
};

export type LaunchIsolationSession = {
  ruleGroup: string;
  executablePath: string;
  gameName: string;
};

export type LaunchIsolationDiagnostics = {
  providerId: string;
  backend: 'none' | 'powershell' | 'native';
  nativeHelperPresent: boolean;
  nativeHelperCompatible?: boolean;
  nativeHelperVersion?: string | null;
  requiredHelperVersion?: string | null;
  helperCompatibilityMessage?: string;
};

export type LaunchIsolationProvider = {
  id: string;
  isSupported: () => boolean;
  requiresElevation: () => boolean;
  getDiagnostics?: () => LaunchIsolationDiagnostics;
  createSession: (
    executablePath: string,
    request: LaunchIsolationRequest,
  ) => Promise<LaunchIsolationSession | null>;
  cleanupSession: (session: LaunchIsolationSession) => Promise<void>;
};
