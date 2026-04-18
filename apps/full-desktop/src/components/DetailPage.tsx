import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import type { GameSummary } from '../types';
import { DetailPage as SharedDetailPage } from '../../../shared/app-shell/components/DetailPage';

type DetailPageProps = {
  game: GameSummary;
  contentScaleStyle: CSSProperties;
  canLaunch: boolean;
  canOpenFolders: boolean;
  supportsNativeContextMenu: boolean;
  actionLabels: {
    back: string;
    play: string;
    playByVersion: string;
  };
  focusCard: ReactNode;
  getImageSrc: (filePath: string | null) => string | null;
  onBack: () => void;
  onPlay: (game: GameSummary, event: MouseEvent<HTMLButtonElement>) => void;
  onPlayWithVersionPrompt: (game: GameSummary, event: MouseEvent<HTMLButtonElement>) => void;
  onOpenMetadata: (gamePath: string) => void;
  onOpenGameFolder: (gamePath: string) => void;
  onOpenVersionFolder: (versionPath: string) => void;
  onOpenVersionContextMenu: (versionPath: string, versionName: string) => void;
  onCompressVersion: (gamePath: string, gameName: string, versionPath: string, versionName: string) => Promise<void>;
  onOpenPictures: (gamePath: string) => void;
  onOpenScreenshot: (imagePath: string) => void;
};

export function DetailPage({
  game,
  contentScaleStyle,
  canLaunch,
  canOpenFolders,
  supportsNativeContextMenu,
  actionLabels,
  focusCard,
  getImageSrc,
  onBack,
  onPlay,
  onPlayWithVersionPrompt,
  onOpenMetadata,
  onOpenGameFolder,
  onOpenVersionFolder,
  onOpenVersionContextMenu,
  onCompressVersion,
  onOpenPictures,
  onOpenScreenshot,
}: DetailPageProps) {
  return (
    <SharedDetailPage<GameSummary>
      game={game}
      contentScaleStyle={contentScaleStyle}
      canLaunch={canLaunch}
      canOpenFolders={canOpenFolders}
      supportsNativeContextMenu={supportsNativeContextMenu}
      actionLabels={actionLabels}
      focusCard={focusCard}
      getImageSrc={getImageSrc}
      onBack={onBack}
      onPlay={onPlay}
      onPlayWithVersionPrompt={onPlayWithVersionPrompt}
      onOpenMetadata={onOpenMetadata}
      onOpenGameFolder={onOpenGameFolder}
      onOpenVersionFolder={onOpenVersionFolder}
      onOpenVersionContextMenu={onOpenVersionContextMenu}
      onCompressVersion={onCompressVersion}
      onOpenPictures={onOpenPictures}
      onOpenScreenshot={onOpenScreenshot}
      enableArchiveUpload={false}
      enableInlineContextMenus={false}
      enableExtrasSection={false}
    />
  );
}
