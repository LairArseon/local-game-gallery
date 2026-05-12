import type { NotificationFeedAction, NotificationFeedItem } from '../types';
import { NotificationFeedPanel as SharedNotificationFeedPanel } from '../../../shared/app-shell/components/NotificationFeedPanel';

type NotificationFeedPanelProps = {
  items: NotificationFeedItem[];
  onOpenGame: (gamePath: string) => void;
  onAction: (item: NotificationFeedItem, action: NotificationFeedAction) => void;
};

export function NotificationFeedPanel({
  items,
  onOpenGame,
  onAction,
}: NotificationFeedPanelProps) {
  return (
    <SharedNotificationFeedPanel
      items={items}
      onOpenGame={onOpenGame}
      onAction={onAction}
    />
  );
}