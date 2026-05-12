import { useTranslation } from 'react-i18next';
import { ArrowUp10, CircleAlert, CircleX, ExternalLink } from 'lucide-react';
import type { NotificationFeedAction, NotificationFeedItem } from '../types';

type NotificationFeedPanelProps = {
  items: NotificationFeedItem[];
  onOpenGame: (gamePath: string) => void;
  onAction: (item: NotificationFeedItem, action: NotificationFeedAction) => void;
};

function getSourceBadgeLabel(item: NotificationFeedItem) {
  if (item.sourceKind === 'module') {
    const moduleId = String(item.metadata?.moduleId ?? item.sourceId ?? '').trim();
    return moduleId ? moduleId.toUpperCase() : 'MODULE';
  }

  if (item.sourceKind === 'vault-alert') {
    return 'VAULT';
  }

  if (item.sourceKind === 'version-mismatch') {
    return 'VERSION';
  }

  return item.sourceKind.toUpperCase();
}

function renderActionIcon(kind: NotificationFeedAction['kind']) {
  if (kind === 'resolve') {
    return <ArrowUp10 size={14} aria-hidden="true" />;
  }

  if (kind === 'dismiss') {
    return <CircleX size={14} aria-hidden="true" />;
  }

  if (kind === 'open-url') {
    return <ExternalLink size={14} aria-hidden="true" />;
  }

  return <CircleAlert size={14} aria-hidden="true" />;
}

export function NotificationFeedPanel({
  items,
  onOpenGame,
  onAction,
}: NotificationFeedPanelProps) {
  const { t } = useTranslation();

  return (
    <section className="topbar-notifications" aria-live="polite">
      <div className="topbar-notifications__heading">
        <h3>{t('notificationHub.title')}</h3>
        <p>{t('notificationHub.count', { count: items.length })}</p>
      </div>
      <p className="topbar-notifications__hint">{t('notificationHub.focusHint')}</p>
      {items.length ? (
        <ul className="topbar-notifications__list">
          {items.map((item) => (
            <li key={item.id} className={`topbar-notifications__item topbar-notifications__item--${item.sourceKind}`}>
              <div className="topbar-notifications__item-main">
                <div className="topbar-notifications__item-title-row">
                  <span className={`topbar-notifications__source-badge topbar-notifications__source-badge--${item.sourceKind}`}>
                    {getSourceBadgeLabel(item)}
                  </span>
                  {item.gamePath ? (
                    <button
                      type="button"
                      className="topbar-notifications__game-link"
                      aria-label={t('notificationHub.openGameAria', { game: item.title })}
                      onClick={() => onOpenGame(item.gamePath as string)}
                    >
                      <span className="topbar-notifications__game-name">{item.title}</span>
                    </button>
                  ) : (
                    <span className="topbar-notifications__game-name">{item.title}</span>
                  )}
                </div>
                <p className="topbar-notifications__version-delta">{item.message}</p>
              </div>
              {item.actions.length ? (
                <div className="topbar-notifications__item-actions">
                  {item.actions.map((action) => (
                    <button
                      key={action.id}
                      className={`topbar-notifications__icon-action topbar-notifications__icon-action--${action.kind}`}
                      type="button"
                      onClick={() => onAction(item, action)}
                      title={action.label}
                      aria-label={action.label}
                      disabled={action.disabled}
                    >
                      {renderActionIcon(action.kind)}
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="topbar-notifications__empty">{t('notificationHub.empty')}</p>
      )}
    </section>
  );
}