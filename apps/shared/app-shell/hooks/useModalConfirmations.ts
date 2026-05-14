/**
 * Promise-backed confirmation flow manager for critical modal prompts.
 *
 * This hook coordinates open/resolve cycles for mirror sync, parity sync, and
 * decompress-before-launch confirmation dialogs.
 */
import { useEffect, useRef, useState } from 'react';
import type { LaunchGameCandidate } from '../types/gameActionsTypes';

export type DecompressLaunchConfirmContext = {
  gameName: string;
  versionName: string;
};

export type ExecutableChoiceContext = {
  gameName: string;
  reason: 'choose-version-temporary' | 'resolve-version-mismatch';
  candidates: LaunchGameCandidate[];
};

export function useModalConfirmations() {
  const [isMirrorSyncConfirmOpen, setIsMirrorSyncConfirmOpen] = useState(false);
  const [isMirrorParityConfirmOpen, setIsMirrorParityConfirmOpen] = useState(false);
  const [decompressLaunchConfirmContext, setDecompressLaunchConfirmContext] = useState<DecompressLaunchConfirmContext | null>(null);
  const [executableChoiceContext, setExecutableChoiceContext] = useState<ExecutableChoiceContext | null>(null);

  const mirrorSyncConfirmResolveRef = useRef<((shouldSync: boolean) => void) | null>(null);
  const mirrorParityConfirmResolveRef = useRef<((shouldSync: boolean) => void) | null>(null);
  const decompressLaunchConfirmResolveRef = useRef<((shouldDecompress: boolean) => void) | null>(null);
  const executableChoiceResolveRef = useRef<((candidate: LaunchGameCandidate | null) => void) | null>(null);

  useEffect(() => () => {
    if (mirrorSyncConfirmResolveRef.current) {
      mirrorSyncConfirmResolveRef.current(false);
      mirrorSyncConfirmResolveRef.current = null;
    }

    if (mirrorParityConfirmResolveRef.current) {
      mirrorParityConfirmResolveRef.current(false);
      mirrorParityConfirmResolveRef.current = null;
    }

    if (decompressLaunchConfirmResolveRef.current) {
      decompressLaunchConfirmResolveRef.current(false);
      decompressLaunchConfirmResolveRef.current = null;
    }

    if (executableChoiceResolveRef.current) {
      executableChoiceResolveRef.current(null);
      executableChoiceResolveRef.current = null;
    }
  }, []);

  async function confirmInitialMirrorSync() {
    return new Promise<boolean>((resolve) => {
      if (mirrorSyncConfirmResolveRef.current) {
        mirrorSyncConfirmResolveRef.current(false);
      }

      mirrorSyncConfirmResolveRef.current = resolve;
      setIsMirrorSyncConfirmOpen(true);
    });
  }

  function resolveInitialMirrorSyncConfirmation(shouldSync: boolean) {
    setIsMirrorSyncConfirmOpen(false);

    const resolve = mirrorSyncConfirmResolveRef.current;
    mirrorSyncConfirmResolveRef.current = null;
    resolve?.(shouldSync);
  }

  async function confirmMirrorParitySync() {
    return new Promise<boolean>((resolve) => {
      if (mirrorParityConfirmResolveRef.current) {
        mirrorParityConfirmResolveRef.current(false);
      }

      mirrorParityConfirmResolveRef.current = resolve;
      setIsMirrorParityConfirmOpen(true);
    });
  }

  function resolveMirrorParitySyncConfirmation(shouldSync: boolean) {
    setIsMirrorParityConfirmOpen(false);

    const resolve = mirrorParityConfirmResolveRef.current;
    mirrorParityConfirmResolveRef.current = null;
    resolve?.(shouldSync);
  }

  async function confirmDecompressBeforeLaunch(gameName: string, versionName: string) {
    return new Promise<boolean>((resolve) => {
      if (decompressLaunchConfirmResolveRef.current) {
        decompressLaunchConfirmResolveRef.current(false);
      }

      decompressLaunchConfirmResolveRef.current = resolve;
      setDecompressLaunchConfirmContext({ gameName, versionName });
    });
  }

  function resolveDecompressBeforeLaunchConfirmation(shouldDecompress: boolean) {
    setDecompressLaunchConfirmContext(null);

    const resolve = decompressLaunchConfirmResolveRef.current;
    decompressLaunchConfirmResolveRef.current = null;
    resolve?.(shouldDecompress);
  }

  async function confirmExecutableChoice(context: ExecutableChoiceContext) {
    return new Promise<LaunchGameCandidate | null>((resolve) => {
      if (executableChoiceResolveRef.current) {
        executableChoiceResolveRef.current(null);
      }

      executableChoiceResolveRef.current = resolve;
      setExecutableChoiceContext(context);
    });
  }

  function resolveExecutableChoice(candidate: LaunchGameCandidate | null) {
    setExecutableChoiceContext(null);

    const resolve = executableChoiceResolveRef.current;
    executableChoiceResolveRef.current = null;
    resolve?.(candidate);
  }

  return {
    isMirrorSyncConfirmOpen,
    isMirrorParityConfirmOpen,
    decompressLaunchConfirmContext,
    executableChoiceContext,
    confirmInitialMirrorSync,
    resolveInitialMirrorSyncConfirmation,
    confirmMirrorParitySync,
    resolveMirrorParitySyncConfirmation,
    confirmDecompressBeforeLaunch,
    resolveDecompressBeforeLaunchConfirmation,
    confirmExecutableChoice,
    resolveExecutableChoice,
  };
}
