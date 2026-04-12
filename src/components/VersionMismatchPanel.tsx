/**
 * Floating notification center for version mismatches.
 *
 * This component is intentionally presentational: it renders mismatch rows and
 * emits user intent (focus/resolve/dismiss) through callbacks supplied by the
 * mismatch hook/App orchestration layer.
 *
 * New to this project: this panel is notification UI for mismatch and vault alerts; trace resolve/dismiss/open callbacks to useVersionMismatchManager and vault state.
 */
import { useTranslation } from 'react-i18next';
import { ArrowRight, ArrowUp10, CircleX } from 'lucide-react';
import type { GameSummary } from '../types';

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
  const { t } = useTranslation();
  const totalNotifications = games.length + missingVaultedPaths.length;

  return (
    <section className="topbar-notifications" aria-live="polite">
      <div className="topbar-notifications__heading">
        <h3>{t('versionMismatch.title')}</h3>
        <p>{t('versionMismatch.count', { count: totalNotifications })}</p>
      </div>
      <p className="topbar-notifications__hint">{t('versionMismatch.focusHint')}</p>
      {missingVaultedPaths.length ? (
        <section className="topbar-notifications__vault-alerts">
          <h4>{t('vaultNotifications.title')}</h4>
          <ul className="topbar-notifications__vault-list">
            {missingVaultedPaths.map((gamePath) => (
              <li key={gamePath} className="topbar-notifications__vault-item">
                <span>{gamePath}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {games.length ? (
        <ul className="topbar-notifications__list">
          {games.map((game) => (
            <li key={game.path} className="topbar-notifications__item">
              <button
                type="button"
                className="topbar-notifications__game-link"
                aria-label={t('versionMismatch.openGameAria', { game: game.name })}
                onClick={() => onOpenGame(game.path)}
              >
                <span className="topbar-notifications__game-name">{game.name}</span>
              </button>
              {/* Keep version delta compact so many notifications stay scannable. */}
              <p className="topbar-notifications__version-delta" aria-label={t('versionMismatch.itemSummary', {
                current: game.metadata.latestVersion || t('detail.unknown'),
                detected: game.detectedLatestVersion || t('detail.unknown'),
              })}>
                <span>{game.metadata.latestVersion || t('detail.unknown')}</span>
                <ArrowRight size={14} aria-hidden="true" />
                <span>{game.detectedLatestVersion || t('detail.unknown')}</span>
              </p>
              <div className="topbar-notifications__item-actions">
                <button
                  className="topbar-notifications__icon-action topbar-notifications__icon-action--resolve"
                  type="button"
                  onClick={() => onResolve(game)}
                  title={t('versionMismatch.resolve')}
                  aria-label={t('versionMismatch.resolve')}
                >
                  <ArrowUp10 size={14} aria-hidden="true" />
                </button>
                <button
                  className="topbar-notifications__icon-action topbar-notifications__icon-action--dismiss"
                  type="button"
                  onClick={() => onDismiss(game)}
                  title={t('versionMismatch.dismiss')}
                  aria-label={t('versionMismatch.dismiss')}
                >
                  <CircleX size={14} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        missingVaultedPaths.length ? null : <p className="topbar-notifications__empty">{t('versionMismatch.empty')}</p>
      )}
    </section>
  );
}





