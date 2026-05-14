/**
 * Shared core for high-frequency game actions (play/detail/open/select).
 */
import type { MouseEvent } from 'react';
import type { GameSummaryLike, UseGameActionsCoreArgs } from '../types/gameActionsTypes';

export function useGameActionsCore<TGame extends GameSummaryLike>({
  games,
  canLaunch,
  launchBlockedMessage,
  setStatus,
  setDetailGamePath,
  setSelectedGamePath,
  refreshScan,
  confirmDecompressBeforeLaunch,
  decompressVersionBeforeLaunch,
  logAppEvent,
  toErrorMessage,
  confirmExecutableChoice,
  listLaunchCandidates,
  playGame,
  openFolder,
}: UseGameActionsCoreArgs<TGame>) {
  function handlePlayClick(game: TGame, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    void onPlayGame(game);
  }

  function handlePlayWithVersionPromptClick(game: TGame, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    void onPlayGameWithVersionPrompt(game);
  }

  async function onPlayGame(game: TGame) {
    return runPlayGame(game, 'default');
  }

  async function onPlayGameWithVersionPrompt(game: TGame) {
    return runPlayGame(game, 'choose-version-temporary');
  }

  async function runPlayGame(game: TGame, launchMode: 'default' | 'choose-version-temporary') {
    if (!canLaunch) {
      if (launchBlockedMessage) {
        setStatus(launchBlockedMessage);
      }
      return;
    }

    try {
      let explicitExecutablePath: string | undefined;
      if (launchMode === 'choose-version-temporary') {
        const candidateResult = await listLaunchCandidates({
          gamePath: game.path,
          gameName: game.name,
          versions: game.versions.map((version) => ({
            name: version.name,
            path: version.path,
            storageState: version.storageState,
            storageArchivePath: version.storageArchivePath,
          })),
        });

        if (!candidateResult.candidates.length) {
          setStatus(candidateResult.message || 'No executable files were found.');
          return;
        }

        if (candidateResult.candidates.length === 1) {
          explicitExecutablePath = candidateResult.candidates[0]?.executablePath;
        } else if (confirmExecutableChoice) {
          const choice = await confirmExecutableChoice({
            gameName: game.name,
            reason: 'choose-version-temporary',
            candidates: candidateResult.candidates,
          });
          if (!choice) {
            setStatus('Play canceled.');
            return;
          }

          explicitExecutablePath = choice.executablePath;
        } else {
          setStatus(candidateResult.message || 'Multiple executables were found.');
          return;
        }
      }

      const preferredVersionName = (launchMode === 'default'
        ? (game.metadata.latestVersion || game.detectedLatestVersion)
        : game.versions[0]?.name) || game.versions[0]?.name || '';
      const preferredVersion = game.versions.find((version) => version.name === preferredVersionName) ?? game.versions[0];
      let skipDecompressPrompt = false;

      if (
        launchMode === 'default'
        && preferredVersion?.storageState === 'compressed'
        && confirmDecompressBeforeLaunch
      ) {
        const confirmed = await confirmDecompressBeforeLaunch(game.name, preferredVersion.name);
        if (!confirmed) {
          setStatus('Play canceled.');
          return;
        }

        if (decompressVersionBeforeLaunch) {
          await decompressVersionBeforeLaunch(game.path, game.name, preferredVersion.path, preferredVersion.name);
          skipDecompressPrompt = true;
        }
      }

      const result = await playGame({
        gamePath: game.path,
        gameName: game.name,
        versions: game.versions.map((version) => ({
          name: version.name,
          path: version.path,
          storageState: version.storageState,
          storageArchivePath: version.storageArchivePath,
        })),
        launchMode,
        skipDecompressPrompt,
        explicitExecutablePath,
      });
      setStatus(result.message);
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to launch game.');
      setStatus(message);
      void logAppEvent(message, 'error', 'play-game');
    }
  }

  function handleOpenDetail(game: TGame, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setDetailGamePath(game.path);
    setSelectedGamePath(game.path);
  }

  function openGameDetailFromPath(gamePath: string) {
    const game = games.find((candidate) => candidate.path === gamePath);
    if (!game) {
      return;
    }

    setDetailGamePath(game.path);
    setSelectedGamePath(game.path);
  }

  async function openFolderInExplorer(folderPath: string) {
    try {
      const result = await openFolder({ folderPath });
      setStatus(result.message);
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to open folder.');
      setStatus(message);
      void logAppEvent(message, 'error', 'open-folder');
    }
  }

  function toggleGameSelection(path: string) {
    setSelectedGamePath((current) => (current === path ? null : path));
  }

  return {
    handlePlayClick,
    handlePlayWithVersionPromptClick,
    playGame: onPlayGame,
    playGameWithVersionPrompt: onPlayGameWithVersionPrompt,
    handleOpenDetail,
    openGameDetailFromPath,
    openFolderInExplorer,
    toggleGameSelection,
  };
}

