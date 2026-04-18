import type { GameSummary } from '../types';
import { VersionMismatchPanel as SharedVersionMismatchPanel } from '../../../shared/app-shell/components/VersionMismatchPanel';

type VersionMismatchPanelProps = {
  games: GameSummary[];
  missingVaultedPaths: string[];
  onOpenGame: (gamePath: string) => void;
  onResolve: (game: GameSummary) => void;
  onDismiss: (game: GameSummary) => void;
};

export function VersionMismatchPanel({
  games,
  missingVaultedPaths,
  onOpenGame,
  onResolve,
  onDismiss,
}: VersionMismatchPanelProps) {
  return (
    <SharedVersionMismatchPanel<GameSummary>
      games={games}
      missingVaultedPaths={missingVaultedPaths}
      onOpenGame={onOpenGame}
      onResolve={onResolve}
      onDismiss={onDismiss}
    />
  );
}

