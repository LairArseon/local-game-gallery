import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { Archive, ArrowLeft, FolderOpen, ListVideo, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';

type DetailPageVersionLike = {
  path: string;
  name: string;
  storageState?: 'compressed' | 'decompressed';
  hasNfo?: boolean;
};

type DetailPageExtraLike = {
  relativePath: string;
  name: string;
  isDirectory: boolean;
};

type DetailPageGameLike = {
  path: string;
  name: string;
  metadata: {
    latestVersion?: string;
    status?: string;
    score?: string;
    description?: string;
    notes: string[];
    tags: string[];
    customTags: Array<{ key: string; value: string }>;
  };
  versions: DetailPageVersionLike[];
  extras?: DetailPageExtraLike[];
  media: {
    screenshots: string[];
  };
};

type DetailPageProps<TGame extends DetailPageGameLike> = {
  game: TGame;
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
  onPlay: (game: TGame, event: MouseEvent<HTMLButtonElement>) => void;
  onPlayWithVersionPrompt: (game: TGame, event: MouseEvent<HTMLButtonElement>) => void;
  onOpenMetadata: (gamePath: string) => void;
  onOpenGameFolder: (gamePath: string) => void;
  onOpenVersionFolder: (versionPath: string) => void;
  onOpenVersionContextMenu: (versionPath: string, versionName: string) => void;
  onCompressVersion: (gamePath: string, gameName: string, versionPath: string, versionName: string) => Promise<void>;
  onOpenPictures: (gamePath: string) => void;
  onOpenScreenshot: (imagePath: string) => void;
  enableArchiveUpload?: boolean;
  onOpenArchiveUploadForGame?: (gamePath: string, gameName: string) => void;
  enableInlineContextMenus?: boolean;
  onDecompressVersion?: (gamePath: string, gameName: string, versionPath: string, versionName: string) => Promise<void>;
  onDownloadVersion?: (gamePath: string, versionPath: string, versionName: string) => void;
  enableExtrasSection?: boolean;
  onDownloadExtra?: (gamePath: string, relativePath: string, itemName: string, isDirectory: boolean) => void;
};

export function DetailPage<TGame extends DetailPageGameLike>({
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
  onOpenMetadata,
  onOpenGameFolder,
  onOpenVersionFolder,
  onOpenVersionContextMenu,
  onCompressVersion,
  onOpenPictures,
  onOpenScreenshot,
  onPlayWithVersionPrompt,
  enableArchiveUpload = false,
  onOpenArchiveUploadForGame,
  enableInlineContextMenus = false,
  onDecompressVersion,
  onDownloadVersion,
  enableExtrasSection = false,
  onDownloadExtra,
}: DetailPageProps<TGame>) {
  const { t } = useTranslation();
  const contextMenuWidth = 220;
  const contextMenuHeight = 112;
  const versionContextMenuRef = useRef<HTMLDivElement | null>(null);
  const extrasContextMenuRef = useRef<HTMLDivElement | null>(null);
  const [versionContextMenu, setVersionContextMenu] = useState<{
    x: number;
    y: number;
    versionPath: string;
    versionName: string;
  } | null>(null);
  const [extrasContextMenu, setExtrasContextMenu] = useState<{
    x: number;
    y: number;
    relativePath: string;
    itemName: string;
    isDirectory: boolean;
  } | null>(null);
  const selectedContextVersion = versionContextMenu
    ? game.versions.find((version) => version.path === versionContextMenu.versionPath) ?? null
    : null;
  const contextVersionIsCompressed = selectedContextVersion?.storageState === 'compressed';
  const extras = game.extras ?? [];

  useEffect(() => {
    if (!enableInlineContextMenus || (!extrasContextMenu && !versionContextMenu)) {
      return;
    }

    const closeMenuFromPointer = (event: MouseEvent | globalThis.MouseEvent) => {
      const targetNode = event.target as Node | null;
      if (targetNode && versionContextMenuRef.current?.contains(targetNode)) {
        return;
      }
      if (targetNode && extrasContextMenuRef.current?.contains(targetNode)) {
        return;
      }

      setVersionContextMenu(null);
      setExtrasContextMenu(null);
    };

    const closeMenuFromContextMenu = (event: globalThis.MouseEvent) => {
      const targetNode = event.target as Node | null;
      if (targetNode && versionContextMenuRef.current?.contains(targetNode)) {
        return;
      }
      if (targetNode && extrasContextMenuRef.current?.contains(targetNode)) {
        return;
      }

      setVersionContextMenu(null);
      setExtrasContextMenu(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setVersionContextMenu(null);
        setExtrasContextMenu(null);
      }
    };

    window.addEventListener('mousedown', closeMenuFromPointer, true);
    window.addEventListener('contextmenu', closeMenuFromContextMenu, true);
    window.addEventListener('keydown', handleEscape, true);

    return () => {
      window.removeEventListener('mousedown', closeMenuFromPointer, true);
      window.removeEventListener('contextmenu', closeMenuFromContextMenu, true);
      window.removeEventListener('keydown', handleEscape, true);
    };
  }, [enableInlineContextMenus, extrasContextMenu, versionContextMenu]);

  return (
    <section className="detail-page" style={contentScaleStyle}>
      <header className="detail-page__header">
        <button
          className="button button--icon-only"
          type="button"
          onClick={onBack}
          aria-label={actionLabels.back}
          title={actionLabels.back}
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
        <h2>{game.name}</h2>
        {canLaunch ? (
          <button
            className="button button--play button--icon-only"
            type="button"
            onClick={(event) => onPlay(game, event)}
            aria-label={actionLabels.play}
            title={actionLabels.play}
          >
            <Play size={16} aria-hidden="true" />
          </button>
        ) : null}
        {canLaunch && game.versions.length > 1 ? (
          <button
            className="button button--play-version button--icon-only"
            type="button"
            onClick={(event) => onPlayWithVersionPrompt(game, event)}
            aria-label={actionLabels.playByVersion}
            title={actionLabels.playByVersion}
          >
            <ListVideo size={16} aria-hidden="true" />
          </button>
        ) : null}
      </header>
      {focusCard}
      <section className="detail-section panel">
        <div className="detail-section__header">
          <h3>{t('detail.allMetadata')}</h3>
          <button className="button button--icon" type="button" onClick={() => onOpenMetadata(game.path)}>
            {t('detail.editMetadata')}
          </button>
        </div>
        <div className="detail-metadata-grid">
          <div>
            <p>{t('detail.latestVersion')}: {game.metadata.latestVersion || t('detail.unknown')}</p>
            <p>{t('detail.status')}: {game.metadata.status || t('detail.notSet')}</p>
            <p>{t('detail.score')}: {game.metadata.score || t('detail.notSet')}</p>
            <p>{t('detail.description')}: {game.metadata.description || t('detail.noDescription')}</p>
            <div className="detail-tags">
              <strong>{t('detail.notes')}</strong>
              {game.metadata.notes.filter(Boolean).map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
            {game.metadata.tags.length ? (
              <div className="detail-tags">
                <strong>{t('detail.tags')}</strong>
                <p>{game.metadata.tags.join(', ')}</p>
              </div>
            ) : null}
            {game.metadata.customTags.length ? (
              <div className="detail-tags">
                <strong>{t('detail.additionalTags')}</strong>
                {game.metadata.customTags.map((tag) => (
                  <p key={tag.key}>{tag.key}: {tag.value}</p>
                ))}
              </div>
            ) : null}
          </div>
          <aside className="detail-versions">
            <div className="detail-versions__header">
              <strong>{t('detail.versions')}</strong>
              {enableArchiveUpload ? (
                <button
                  className="button button--icon"
                  type="button"
                  onClick={() => onOpenArchiveUploadForGame?.(game.path, game.name)}
                >
                  {t('detail.addVersionFromArchive')}
                </button>
              ) : null}
              {canOpenFolders ? (
                <button className="button button--icon" type="button" onClick={() => onOpenGameFolder(game.path)}>
                  {t('detail.openGameFolder')}
                </button>
              ) : null}
            </div>
            {game.versions.length ? (
              <ul className="detail-versions__list">
                {game.versions.map((version) => (
                  <li key={version.path}>
                    <button
                      className="detail-versions__item"
                      type="button"
                      disabled={!canOpenFolders}
                      onContextMenu={(event) => {
                        if (!enableInlineContextMenus) {
                          if (!supportsNativeContextMenu) {
                            event.preventDefault();
                            void onCompressVersion(game.path, game.name, version.path, version.name);
                            return;
                          }

                          event.preventDefault();
                          onOpenVersionContextMenu(version.path, version.name);
                          return;
                        }

                        event.preventDefault();
                        const left = Math.max(8, Math.min(event.clientX, window.innerWidth - contextMenuWidth - 8));
                        const top = Math.max(8, Math.min(event.clientY, window.innerHeight - contextMenuHeight - 8));
                        setVersionContextMenu({
                          x: left,
                          y: top,
                          versionPath: version.path,
                          versionName: version.name,
                        });
                      }}
                      onClick={() => {
                        if (canOpenFolders) {
                          onOpenVersionFolder(version.path);
                        }
                      }}
                      title={canOpenFolders ? t('detail.versionActionsHint') : undefined}
                    >
                      <span>{version.name}</span>
                      <span
                        className="detail-versions__state"
                        title={`${version.storageState === 'compressed' ? t('detail.storageCompressed') : t('detail.storageDecompressed')} · ${version.hasNfo ? t('detail.hasNfo') : t('detail.noNfo')}`}
                      >
                        {version.storageState === 'compressed'
                          ? <Archive size={14} aria-hidden="true" />
                          : <FolderOpen size={14} aria-hidden="true" />}
                        <span className="detail-versions__state-text">
                          {version.storageState === 'compressed' ? t('detail.storageCompressed') : t('detail.storageDecompressed')}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t('detail.noVersions')}</p>
            )}

            {enableExtrasSection ? (
              <>
                <div className="detail-versions__header">
                  <strong>{t('detail.extras')}</strong>
                </div>
                {extras.length ? (
                  <ul className="detail-versions__list">
                    {extras.map((extra) => (
                      <li key={extra.relativePath}>
                        <button
                          className="detail-versions__item"
                          type="button"
                          onContextMenu={(event) => {
                            if (!enableInlineContextMenus) {
                              return;
                            }

                            event.preventDefault();
                            const left = Math.max(8, Math.min(event.clientX, window.innerWidth - contextMenuWidth - 8));
                            const top = Math.max(8, Math.min(event.clientY, window.innerHeight - contextMenuHeight - 8));
                            setExtrasContextMenu({
                              x: left,
                              y: top,
                              relativePath: extra.relativePath,
                              itemName: extra.name,
                              isDirectory: extra.isDirectory,
                            });
                          }}
                        >
                          <span>{extra.name}</span>
                          <span>{extra.isDirectory ? t('detail.folder') : t('detail.file')}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{t('detail.noExtras')}</p>
                )}
              </>
            ) : null}
          </aside>
        </div>
      </section>
      <section className="detail-section panel">
        <div className="detail-section__header">
          <h3>{t('detail.screenshots')}</h3>
          <button className="button button--icon" type="button" onClick={() => onOpenPictures(game.path)}>
            {t('detail.addImages')}
          </button>
        </div>
        {game.media.screenshots.length ? (
          <div className="screenshot-grid">
            {game.media.screenshots.map((imagePath) => (
              <button
                key={imagePath}
                type="button"
                className="screenshot-grid__item"
                onClick={() => onOpenScreenshot(imagePath)}
              >
                <img src={getImageSrc(imagePath) ?? undefined} alt="Screenshot" className="media-preview" />
              </button>
            ))}
          </div>
        ) : (
          <p>{t('detail.noScreenshots')}</p>
        )}
      </section>
      {enableInlineContextMenus && extrasContextMenu ? createPortal(
        <div
          ref={extrasContextMenuRef}
          className="context-menu"
          style={{ left: extrasContextMenu.x, top: extrasContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className="context-menu__item"
            type="button"
            onClick={() => {
              setExtrasContextMenu(null);
              onDownloadExtra?.(game.path, extrasContextMenu.relativePath, extrasContextMenu.itemName, extrasContextMenu.isDirectory);
            }}
          >
            {t('detail.downloadExtra')}
          </button>
        </div>,
        document.body,
      ) : null}
      {enableInlineContextMenus && versionContextMenu ? createPortal(
        <div
          ref={versionContextMenuRef}
          className="context-menu"
          style={{ left: versionContextMenu.x, top: versionContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className="context-menu__item"
            type="button"
            onClick={() => {
              setVersionContextMenu(null);
              onOpenVersionFolder(versionContextMenu.versionPath);
            }}
          >
            {t('detail.openVersionFolder')}
          </button>
          <button
            className="context-menu__item"
            type="button"
            onClick={() => {
              setVersionContextMenu(null);
              onDownloadVersion?.(game.path, versionContextMenu.versionPath, `${game.name}_${versionContextMenu.versionName}`);
            }}
          >
            {t('detail.downloadVersion')}
          </button>
          <button
            className="context-menu__item"
            type="button"
            onClick={() => {
              setVersionContextMenu(null);
              if (contextVersionIsCompressed) {
                void onDecompressVersion?.(game.path, game.name, versionContextMenu.versionPath, versionContextMenu.versionName);
                return;
              }

              void onCompressVersion(game.path, game.name, versionContextMenu.versionPath, versionContextMenu.versionName);
            }}
          >
            {contextVersionIsCompressed ? t('detail.decompressVersion') : t('detail.compressVersion')}
          </button>
          {supportsNativeContextMenu ? (
            <button
              className="context-menu__item"
              type="button"
              onClick={() => {
                setVersionContextMenu(null);
                onOpenVersionContextMenu(versionContextMenu.versionPath, versionContextMenu.versionName);
              }}
            >
              {t('detail.moreVersionActions')}
            </button>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </section>
  );
}
