/**
 * Main library surface that switches between browsing and detail states.
 *
 * This component owns the structural shell of the right-side content area:
 * detail page mode, gallery/list mode, warning banners, and empty-state copy.
 * It receives renderer callbacks so heavy list/detail presentation logic can be
 * reused while App remains an orchestrator. Special behavior includes dynamic
 * card grid wiring and view-mode switch controls.
 *
 * New to this project: this component decides between gallery and detail surfaces; trace incoming renderer callbacks to understand list/detail composition boundaries.
 */
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { DetailPage } from './DetailPage';
import type { GalleryViewMode, GameSummary, ScanResult } from '../types';
import type { MediaImageVariant } from '../../../shared/app-shell/types/gameDisplayTypes';
import { LibraryPanel as SharedLibraryPanel } from '../../../shared/app-shell/components/LibraryPanel';

const galleryViewModes: GalleryViewMode[] = ['poster', 'card', 'compact', 'expanded'];

type LibraryPanelProps = {
  isNarrowViewport: boolean;
  detailGame: GameSummary | null;
  detailBackgroundSrc: string | null;
  contentScaleStyle: CSSProperties;
  canLaunch: boolean;
  canOpenFolders: boolean;
  supportsNativeContextMenu: boolean;
  actionLabels: {
    back: string;
    play: string;
    playByVersion: string;
  };
  renderFocusCard: (game: GameSummary, isVertical: boolean, showActions?: boolean) => ReactNode;
  getImageSrc: (filePath: string | null, variant?: MediaImageVariant) => string | null;
  onBackFromDetail: () => void;
  onPlay: (game: GameSummary, event: React.MouseEvent<HTMLButtonElement>) => void;
  onPlayWithVersionPrompt: (game: GameSummary, event: React.MouseEvent<HTMLButtonElement>) => void;
  onOpenMetadata: (gamePath: string) => void;
  onOpenArchiveUploadForGame: (gamePath: string, gameName: string) => void;
  onOpenGameFolder: (gamePath: string) => void;
  onOpenVersionFolder: (versionPath: string) => void;
  onOpenVersionContextMenu: (versionPath: string, versionName: string) => void;
  onCompressVersion: (gamePath: string, gameName: string, versionPath: string, versionName: string) => Promise<void>;
  onDecompressVersion: (gamePath: string, gameName: string, versionPath: string, versionName: string) => Promise<void>;
  onDownloadVersion: (gamePath: string, versionPath: string, versionName: string) => void;
  onDownloadExtra: (gamePath: string, relativePath: string, itemName: string, isDirectory: boolean) => void;
  onOpenPictures: (gamePath: string) => void;
  onOpenScreenshot: (imagePath: string) => void;
  scanResult: ScanResult;
  viewMode: GalleryViewMode;
  viewModeLabels: Record<GalleryViewMode, string>;
  onChangeViewMode: (mode: GalleryViewMode) => void;
  filteredGames: GameSummary[];
  selectedGame: GameSummary | null;
  cardsContainerRef: RefObject<HTMLDivElement | null>;
  gridColumns: number;
  renderInlinePosterCardFocus: () => ReactNode;
  renderGame: (game: GameSummary) => ReactNode;
};

export function LibraryPanel({
  isNarrowViewport,
  detailGame,
  detailBackgroundSrc,
  contentScaleStyle,
  canLaunch,
  canOpenFolders,
  supportsNativeContextMenu,
  actionLabels,
  renderFocusCard,
  getImageSrc,
  onBackFromDetail,
  onPlay,
  onPlayWithVersionPrompt,
  onOpenMetadata,
  onOpenArchiveUploadForGame,
  onOpenGameFolder,
  onOpenVersionFolder,
  onOpenVersionContextMenu,
  onCompressVersion,
  onDecompressVersion,
  onDownloadVersion,
  onDownloadExtra,
  onOpenPictures,
  onOpenScreenshot,
  scanResult,
  viewMode,
  viewModeLabels,
  onChangeViewMode,
  filteredGames,
  selectedGame,
  cardsContainerRef,
  gridColumns,
  renderInlinePosterCardFocus,
  renderGame,
}: LibraryPanelProps) {
  return (
    <SharedLibraryPanel<GameSummary, GalleryViewMode, ScanResult>
      isNarrowViewport={isNarrowViewport}
      detailGame={detailGame}
      detailBackgroundSrc={detailBackgroundSrc}
      contentScaleStyle={contentScaleStyle}
      viewModes={galleryViewModes}
      viewMode={viewMode}
      viewModeLabels={viewModeLabels}
      onChangeViewMode={onChangeViewMode}
      filteredGames={filteredGames}
      selectedGame={selectedGame}
      cardsContainerRef={cardsContainerRef}
      gridColumns={gridColumns}
      scanResult={scanResult}
      renderDetailPage={(game) => (
        <DetailPage
          game={game}
          contentScaleStyle={contentScaleStyle}
          canLaunch={canLaunch}
          canOpenFolders={canOpenFolders}
          supportsNativeContextMenu={supportsNativeContextMenu}
          actionLabels={actionLabels}
          focusCard={renderFocusCard(game, true, false)}
          getImageSrc={getImageSrc}
          onBack={onBackFromDetail}
          onPlay={onPlay}
          onPlayWithVersionPrompt={onPlayWithVersionPrompt}
          onOpenMetadata={onOpenMetadata}
          onOpenArchiveUploadForGame={onOpenArchiveUploadForGame}
          onOpenGameFolder={onOpenGameFolder}
          onOpenVersionFolder={onOpenVersionFolder}
          onOpenVersionContextMenu={onOpenVersionContextMenu}
          onCompressVersion={onCompressVersion}
          onDecompressVersion={onDecompressVersion}
          onDownloadVersion={onDownloadVersion}
          onDownloadExtra={onDownloadExtra}
          onOpenPictures={onOpenPictures}
          onOpenScreenshot={onOpenScreenshot}
        />
      )}
      renderFocusCard={renderFocusCard}
      renderInlinePosterCardFocus={renderInlinePosterCardFocus}
      renderGame={renderGame}
    />
  );
}






