import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type GameWithScreenshots = {
  media: {
    screenshots: string[];
  };
};

type ModalHostProps<TGame extends GameWithScreenshots> = {
  games: TGame[];
  metadataModal: ReactNode;
  mediaModal: ReactNode;
  logViewerModal: ReactNode;
  vaultUnlockModal: ReactNode;
  vaultPinModal: ReactNode;
  isMirrorSyncConfirmOpen: boolean;
  onConfirmMirrorSync: () => void;
  onCancelMirrorSync: () => void;
  isMirrorParityConfirmOpen: boolean;
  onConfirmMirrorParitySync: () => void;
  onCancelMirrorParitySync: () => void;
  isDecompressLaunchConfirmOpen: boolean;
  decompressLaunchGameName: string;
  decompressLaunchVersionName: string;
  onConfirmDecompressLaunch: () => void;
  onCancelDecompressLaunch: () => void;
  screenshotModalPath: string | null;
  setScreenshotModalPath: (nextPath: string | null) => void;
  filePathToSrc: (filePath: string | null) => string | null;
};

export function ModalHost<TGame extends GameWithScreenshots>({
  games,
  metadataModal,
  mediaModal,
  logViewerModal,
  vaultUnlockModal,
  vaultPinModal,
  isMirrorSyncConfirmOpen,
  onConfirmMirrorSync,
  onCancelMirrorSync,
  isMirrorParityConfirmOpen,
  onConfirmMirrorParitySync,
  onCancelMirrorParitySync,
  isDecompressLaunchConfirmOpen,
  decompressLaunchGameName,
  decompressLaunchVersionName,
  onConfirmDecompressLaunch,
  onCancelDecompressLaunch,
  screenshotModalPath,
  setScreenshotModalPath,
  filePathToSrc,
}: ModalHostProps<TGame>) {
  const { t } = useTranslation();
  const thumbsViewportRef = useRef<HTMLDivElement | null>(null);
  const [isThumbOverflowing, setIsThumbOverflowing] = useState(false);
  const [canScrollThumbsPrev, setCanScrollThumbsPrev] = useState(false);
  const [canScrollThumbsNext, setCanScrollThumbsNext] = useState(false);

  const screenshotGallery = useMemo(() => {
    if (!screenshotModalPath) {
      return {
        screenshots: [] as string[],
        currentIndex: -1,
      };
    }

    const owningGame = games.find((game) => game.media.screenshots.includes(screenshotModalPath));
    if (!owningGame) {
      return {
        screenshots: [screenshotModalPath],
        currentIndex: 0,
      };
    }

    const currentIndex = owningGame.media.screenshots.indexOf(screenshotModalPath);
    return {
      screenshots: owningGame.media.screenshots,
      currentIndex: currentIndex >= 0 ? currentIndex : 0,
    };
  }, [games, screenshotModalPath]);

  const hasLightboxGallery = screenshotGallery.screenshots.length > 1;

  useEffect(() => {
    if (!hasLightboxGallery) {
      setCanScrollThumbsPrev(false);
      setCanScrollThumbsNext(false);
      return;
    }

    const viewport = thumbsViewportRef.current;
    if (!viewport) {
      return;
    }

    const updateThumbScrollState = () => {
      const overflowAmount = viewport.scrollWidth - viewport.clientWidth;
      const isOverflowing = overflowAmount > 4;
      setIsThumbOverflowing(isOverflowing);

      if (!isOverflowing) {
        setCanScrollThumbsPrev(false);
        setCanScrollThumbsNext(false);
        return;
      }

      const maxScroll = viewport.scrollWidth - viewport.clientWidth;
      setCanScrollThumbsPrev(viewport.scrollLeft > 1);
      setCanScrollThumbsNext(viewport.scrollLeft < maxScroll - 1);
    };

    const syncActiveThumbIntoView = () => {
      const activeThumb = viewport.querySelector<HTMLButtonElement>('.lightbox-thumb--active');
      activeThumb?.scrollIntoView({ block: 'nearest', inline: 'center' });
      updateThumbScrollState();
    };

    updateThumbScrollState();
    syncActiveThumbIntoView();

    viewport.addEventListener('scroll', updateThumbScrollState, { passive: true });
    window.addEventListener('resize', updateThumbScrollState);

    return () => {
      viewport.removeEventListener('scroll', updateThumbScrollState);
      window.removeEventListener('resize', updateThumbScrollState);
    };
  }, [hasLightboxGallery, screenshotModalPath, screenshotGallery.screenshots.length]);

  function moveLightbox(delta: number) {
    if (!screenshotGallery.screenshots.length || screenshotGallery.currentIndex < 0) {
      return;
    }

    const nextIndex = (screenshotGallery.currentIndex + delta + screenshotGallery.screenshots.length) % screenshotGallery.screenshots.length;
    setScreenshotModalPath(screenshotGallery.screenshots[nextIndex] ?? null);
  }

  function scrollThumbs(delta: number) {
    const viewport = thumbsViewportRef.current;
    if (!viewport) {
      return;
    }

    const thumbnail = viewport.querySelector<HTMLElement>('.lightbox-thumb');
    const thumbWidth = thumbnail?.getBoundingClientRect().width ?? 88;
    viewport.scrollBy({ left: delta * (thumbWidth + 8), behavior: 'smooth' });
  }

  return (
    <>
      {metadataModal}
      {mediaModal}
      {logViewerModal}

      {isMirrorSyncConfirmOpen ? (
        <div className="modal-backdrop" onClick={onCancelMirrorSync}>
          <section className="modal-panel modal-panel--vault" onClick={(event) => event.stopPropagation()}>
            <div className="modal-panel__body modal-panel__body--vault">
              <h3>{t('setup.metadataMirrorSyncTitle')}</h3>
              <p>{t('setup.metadataMirrorSyncBody')}</p>
              <div className="modal-panel__vault-actions">
                <button className="button" type="button" onClick={onCancelMirrorSync}>{t('setup.metadataMirrorSyncLater')}</button>
                <button className="button button--primary" type="button" onClick={onConfirmMirrorSync}>{t('setup.metadataMirrorSyncNow')}</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {isMirrorParityConfirmOpen ? (
        <div className="modal-backdrop" onClick={onCancelMirrorParitySync}>
          <section className="modal-panel modal-panel--vault modal-panel--danger" onClick={(event) => event.stopPropagation()}>
            <div className="modal-panel__body modal-panel__body--vault modal-panel__body--danger">
              <h3>{t('setup.metadataMirrorParitySyncConfirmTitle')}</h3>
              <p>{t('setup.metadataMirrorParitySyncConfirmBody')}</p>
              <div className="modal-panel__vault-actions">
                <button className="button" type="button" onClick={onCancelMirrorParitySync}>{t('setup.metadataMirrorParitySyncCancel')}</button>
                <button className="button button--danger" type="button" onClick={onConfirmMirrorParitySync}>{t('setup.metadataMirrorParitySyncConfirmAction')}</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {isDecompressLaunchConfirmOpen ? (
        <div className="modal-backdrop" onClick={onCancelDecompressLaunch}>
          <section className="modal-panel modal-panel--vault" onClick={(event) => event.stopPropagation()}>
            <div className="modal-panel__body modal-panel__body--vault">
              <h3>{t('detail.decompressLaunchConfirmTitle')}</h3>
              <p>{t('detail.decompressLaunchConfirmBody', { game: decompressLaunchGameName, version: decompressLaunchVersionName })}</p>
              <p>{t('detail.decompressLaunchConfirmHint')}</p>
              <div className="modal-panel__vault-actions">
                <button className="button" type="button" onClick={onCancelDecompressLaunch}>{t('common.cancel')}</button>
                <button className="button button--primary" type="button" onClick={onConfirmDecompressLaunch}>{t('detail.decompressLaunchConfirmAction')}</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {screenshotModalPath ? (
        <div className="modal-backdrop" onClick={() => setScreenshotModalPath(null)}>
          <section className="modal-panel modal-panel--lightbox" onClick={(event) => event.stopPropagation()}>
            <div className={`modal-panel__body modal-panel__body--lightbox ${hasLightboxGallery ? 'modal-panel__body--lightbox-has-thumbs' : ''}`}>
              <div className="lightbox-stage">
                {hasLightboxGallery ? (
                  <button
                    className="lightbox-nav-zone lightbox-nav-zone--prev"
                    type="button"
                    onClick={() => moveLightbox(-1)}
                    aria-label={t('gameView.previousScreenshot')}
                    title={t('gameView.previousScreenshot')}
                  >
                    <span className="lightbox-nav-zone__icon" aria-hidden="true">
                      <ChevronLeft size={22} aria-hidden="true" />
                    </span>
                  </button>
                ) : null}
                <img src={filePathToSrc(screenshotModalPath) ?? undefined} alt={t('media.screenshotAlt')} className="lightbox-image" />
                {hasLightboxGallery ? (
                  <button
                    className="lightbox-nav-zone lightbox-nav-zone--next"
                    type="button"
                    onClick={() => moveLightbox(1)}
                    aria-label={t('gameView.nextScreenshot')}
                    title={t('gameView.nextScreenshot')}
                  >
                    <span className="lightbox-nav-zone__icon" aria-hidden="true">
                      <ChevronRight size={22} aria-hidden="true" />
                    </span>
                  </button>
                ) : null}
              </div>
              {hasLightboxGallery ? (
                <div className="lightbox-thumbs-shell">
                  {isThumbOverflowing ? (
                    <button
                      className="lightbox-thumbs-nav"
                      type="button"
                      onClick={() => scrollThumbs(-1)}
                      disabled={!canScrollThumbsPrev}
                      aria-label={t('gameView.previousScreenshot')}
                      title={t('gameView.previousScreenshot')}
                    >
                      <ChevronLeft size={18} aria-hidden="true" />
                    </button>
                  ) : <span className="lightbox-thumbs-nav-spacer" aria-hidden="true" />}
                  <div className="lightbox-thumbs-viewport" ref={thumbsViewportRef} role="list" aria-label={t('detail.screenshots')}>
                    <div className={`lightbox-thumbs-track ${!isThumbOverflowing ? 'lightbox-thumbs-track--centered' : ''}`}>
                      {screenshotGallery.screenshots.map((imagePath) => (
                        <button
                          key={imagePath}
                          type="button"
                          role="listitem"
                          className={`lightbox-thumb ${imagePath === screenshotModalPath ? 'lightbox-thumb--active' : ''}`}
                          onClick={() => setScreenshotModalPath(imagePath)}
                        >
                          <img src={filePathToSrc(imagePath) ?? undefined} alt={t('media.screenshotAlt')} />
                        </button>
                      ))}
                    </div>
                  </div>
                  {isThumbOverflowing ? (
                    <button
                      className="lightbox-thumbs-nav"
                      type="button"
                      onClick={() => scrollThumbs(1)}
                      disabled={!canScrollThumbsNext}
                      aria-label={t('gameView.nextScreenshot')}
                      title={t('gameView.nextScreenshot')}
                    >
                      <ChevronRight size={18} aria-hidden="true" />
                    </button>
                  ) : <span className="lightbox-thumbs-nav-spacer" aria-hidden="true" />}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {vaultUnlockModal}
      {vaultPinModal}
    </>
  );
}
