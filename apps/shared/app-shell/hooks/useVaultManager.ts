import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { TFunction } from 'i18next';

type GalleryClientLike<TConfig> = {
  saveConfig: (config: TConfig) => Promise<TConfig>;
};

type VaultGameLike = {
  path: string;
  isVaulted: boolean;
};

type ScanResultLike<TGame extends VaultGameLike> = {
  games: TGame[];
};

type VaultConfigLike = {
  tagPool: string[];
  vaultedGamePaths?: string[];
  vaultPin?: string;
};

type UseVaultManagerArgs<TConfig extends VaultConfigLike, TGame extends VaultGameLike, TScanResult extends ScanResultLike<TGame>> = {
  galleryClient: GalleryClientLike<TConfig>;
  computeTagPoolUsage: (tagPool: string[], games: TGame[]) => Record<string, number>;
  config: TConfig | null;
  setConfig: Dispatch<SetStateAction<TConfig | null>>;
  scanResult: TScanResult;
  filteredGames: TGame[];
  selectedGamePath: string | null;
  detailGamePath: string | null;
  setSelectedGamePath: Dispatch<SetStateAction<string | null>>;
  setDetailGamePath: Dispatch<SetStateAction<string | null>>;
  setScanResult: Dispatch<SetStateAction<TScanResult>>;
  setStatus: Dispatch<SetStateAction<string>>;
  refreshScan: () => Promise<unknown>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
  t: TFunction;
  onOpenNotificationCenter: () => void;
};

export function useVaultManager<TConfig extends VaultConfigLike, TGame extends VaultGameLike, TScanResult extends ScanResultLike<TGame>>({
  galleryClient,
  computeTagPoolUsage,
  config,
  setConfig,
  scanResult,
  filteredGames,
  selectedGamePath,
  detailGamePath,
  setSelectedGamePath,
  setDetailGamePath,
  setScanResult,
  setStatus,
  refreshScan,
  logAppEvent,
  toErrorMessage,
  t,
  onOpenNotificationCenter,
}: UseVaultManagerArgs<TConfig, TGame, TScanResult>) {
  const [isVaultOpen, setIsVaultOpen] = useState(false);
  const [isVaultUnlockModalOpen, setIsVaultUnlockModalOpen] = useState(false);
  const [vaultPinInput, setVaultPinInput] = useState('');
  const [vaultPinError, setVaultPinError] = useState<string | null>(null);
  const [isVaultPinModalOpen, setIsVaultPinModalOpen] = useState(false);
  const [newVaultPinInput, setNewVaultPinInput] = useState('');
  const [confirmVaultPinInput, setConfirmVaultPinInput] = useState('');
  const [vaultPinModalError, setVaultPinModalError] = useState<string | null>(null);
  const [pendingMissingVaultedPaths, setPendingMissingVaultedPaths] = useState<string[]>([]);
  const [announcedMissingVaultedPaths, setAnnouncedMissingVaultedPaths] = useState<string[]>([]);

  const visibleFilteredGames = useMemo(
    () => (isVaultOpen ? filteredGames : filteredGames.filter((game) => !game.isVaulted)),
    [filteredGames, isVaultOpen],
  );

  const effectiveTagPoolUsage = useMemo(() => {
    if (!config) {
      return {} as Record<string, number>;
    }

    const sourceGames = isVaultOpen
      ? scanResult.games
      : scanResult.games.filter((game) => !game.isVaulted);

    return computeTagPoolUsage(config.tagPool, sourceGames);
  }, [computeTagPoolUsage, config, isVaultOpen, scanResult.games]);

  useEffect(() => {
    const vaultedPaths = config?.vaultedGamePaths ?? [];
    if (!vaultedPaths.length) {
      setPendingMissingVaultedPaths([]);
      if (!isVaultOpen) {
        setAnnouncedMissingVaultedPaths([]);
      }
      return;
    }

    const scannedPaths = new Set(scanResult.games.map((game) => game.path));
    const missingNow = vaultedPaths.filter((gamePath) => !scannedPaths.has(gamePath));

    if (!isVaultOpen) {
      setPendingMissingVaultedPaths((current) => {
        const tracked = new Set(current.filter((gamePath) => !scannedPaths.has(gamePath)));
        for (const gamePath of missingNow) {
          tracked.add(gamePath);
        }
        return [...tracked];
      });
      return;
    }

    setAnnouncedMissingVaultedPaths((current) => current.filter((gamePath) => !scannedPaths.has(gamePath)));
  }, [config?.vaultedGamePaths, isVaultOpen, scanResult.games]);

  useEffect(() => {
    if (isVaultOpen) {
      return;
    }

    if (selectedGamePath) {
      const selectedGameEntry = scanResult.games.find((game) => game.path === selectedGamePath);
      if (selectedGameEntry?.isVaulted) {
        setSelectedGamePath(null);
      }
    }

    if (detailGamePath) {
      const detailGameEntry = scanResult.games.find((game) => game.path === detailGamePath);
      if (detailGameEntry?.isVaulted) {
        setDetailGamePath(null);
      }
    }
  }, [detailGamePath, isVaultOpen, scanResult.games, selectedGamePath, setDetailGamePath, setSelectedGamePath]);

  function openVaultAfterUnlock() {
    setIsVaultOpen(true);
    if (pendingMissingVaultedPaths.length > 0) {
      setAnnouncedMissingVaultedPaths(pendingMissingVaultedPaths);
      setPendingMissingVaultedPaths([]);
      onOpenNotificationCenter();
    }
  }

  function requestVaultToggle() {
    if (isVaultOpen) {
      setIsVaultOpen(false);
      return;
    }

    const configuredPin = String(config?.vaultPin ?? '').trim();
    if (!configuredPin) {
      openVaultAfterUnlock();
      return;
    }

    setVaultPinError(null);
    setVaultPinInput('');
    setIsVaultUnlockModalOpen(true);
  }

  function cancelVaultUnlock() {
    setIsVaultUnlockModalOpen(false);
    setVaultPinInput('');
    setVaultPinError(null);
  }

  function openVaultPinEditor() {
    if (!isVaultOpen) {
      return;
    }

    setVaultPinModalError(null);
    setNewVaultPinInput('');
    setConfirmVaultPinInput('');
    setIsVaultPinModalOpen(true);
  }

  function cancelVaultPinEditor() {
    setIsVaultPinModalOpen(false);
    setNewVaultPinInput('');
    setConfirmVaultPinInput('');
    setVaultPinModalError(null);
  }

  async function saveVaultPin() {
    if (!config) {
      return;
    }

    const nextPin = newVaultPinInput.trim();
    const confirmPin = confirmVaultPinInput.trim();

    if (!nextPin || nextPin !== confirmPin) {
      const message = t('status.vaultPinMismatch');
      setVaultPinModalError(message);
      setStatus(message);
      return;
    }

    const nextConfig = {
      ...config,
      vaultPin: nextPin,
    } as TConfig;

    setConfig(nextConfig);

    try {
      const saved = await galleryClient.saveConfig(nextConfig);
      setConfig(saved);
      cancelVaultPinEditor();
      setStatus(t('status.vaultPinSaved'));
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to save vault PIN.');
      setStatus(t('status.failedSaveVaultPin'));
      void logAppEvent(message, 'error', 'vault-pin-save');
      await refreshScan();
    }
  }

  async function removeVaultPin() {
    if (!config || !isVaultOpen) {
      return;
    }

    if (!String(config.vaultPin ?? '').trim()) {
      return;
    }

    const nextConfig = {
      ...config,
      vaultPin: '',
    } as TConfig;

    setConfig(nextConfig);

    try {
      const saved = await galleryClient.saveConfig(nextConfig);
      setConfig(saved);
      cancelVaultPinEditor();
      setStatus(t('status.vaultPinRemoved'));
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to remove vault PIN.');
      setStatus(t('status.failedRemoveVaultPin'));
      void logAppEvent(message, 'error', 'vault-pin-remove');
      await refreshScan();
    }
  }

  function confirmVaultUnlock() {
    const configuredPin = String(config?.vaultPin ?? '').trim();
    if (!configuredPin) {
      cancelVaultUnlock();
      openVaultAfterUnlock();
      return;
    }

    if (vaultPinInput.trim() !== configuredPin) {
      setVaultPinError(t('status.vaultPinInvalid'));
      setStatus(t('status.vaultPinInvalid'));
      return;
    }

    cancelVaultUnlock();
    openVaultAfterUnlock();
  }

  async function toggleGameVaultMembership(gamePath: string, shouldBeVaulted: boolean) {
    if (!config) {
      return;
    }

    const currentVaultSet = new Set(config.vaultedGamePaths ?? []);
    const hasChanged = shouldBeVaulted ? !currentVaultSet.has(gamePath) : currentVaultSet.has(gamePath);
    if (!hasChanged) {
      return;
    }

    if (shouldBeVaulted) {
      currentVaultSet.add(gamePath);
    } else {
      currentVaultSet.delete(gamePath);
    }

    const nextConfig = {
      ...config,
      vaultedGamePaths: [...currentVaultSet],
    } as TConfig;

    setConfig(nextConfig);
    setScanResult((current) => ({
      ...current,
      games: current.games.map((game) => (game.path === gamePath ? { ...game, isVaulted: shouldBeVaulted } : game)),
    }));

    if (!shouldBeVaulted) {
      setPendingMissingVaultedPaths((current) => current.filter((entry) => entry !== gamePath));
      setAnnouncedMissingVaultedPaths((current) => current.filter((entry) => entry !== gamePath));
    }

    try {
      const saved = await galleryClient.saveConfig(nextConfig);
      setConfig(saved);
      setStatus(shouldBeVaulted ? t('status.vaultAdded') : t('status.vaultRemoved'));
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to update vault membership.');
      setStatus(t('status.failedUpdateVault'));
      void logAppEvent(message, 'error', 'vault-membership');
      await refreshScan();
    }
  }

  return {
    isVaultOpen,
    requestVaultToggle,
    visibleFilteredGames,
    effectiveTagPoolUsage,
    toggleGameVaultMembership,
    announcedMissingVaultedPaths,
    isVaultUnlockModalOpen,
    vaultPinInput,
    setVaultPinInput,
    vaultPinError,
    confirmVaultUnlock,
    cancelVaultUnlock,
    isVaultPinModalOpen,
    newVaultPinInput,
    setNewVaultPinInput,
    confirmVaultPinInput,
    setConfirmVaultPinInput,
    vaultPinModalError,
    openVaultPinEditor,
    saveVaultPin,
    removeVaultPin,
    cancelVaultPinEditor,
  };
}
