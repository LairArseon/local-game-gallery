import { useTranslation } from 'react-i18next';
import { ArrowRight, ArrowUp10, CircleX } from 'lucide-react';

type VersionMismatchGameLike = {
  path: string;
  name: string;
  detectedLatestVersion?: string;
  metadata: {
    latestVersion?: string;
  };
};

type VersionMismatchPanelProps<TGame extends VersionMismatchGameLike> = {
  games: TGame[];
  missingVaultedPaths: string[];
  onOpenGame: (gamePath: string) => void;
  onResolve: (game: TGame) => void;
  onDismiss: (game: TGame) => void;
};

export function VersionMismatchPanel<TGame extends VersionMismatchGameLike>({
  games,
  missingVaultedPaths,
  onOpenGame,
  onResolve,
  onDismiss,
}: VersionMismatchPanelProps<TGame>) {
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
              <p
                className="topbar-notifications__version-delta"
                aria-label={t('versionMismatch.itemSummary', {
                  current: game.metadata.latestVersion || t('detail.unknown'),
                  detected: game.detectedLatestVersion || t('detail.unknown'),
                })}
              >
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
