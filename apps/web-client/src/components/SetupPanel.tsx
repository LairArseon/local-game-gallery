/**
 * Configuration sidebar for library paths, layout tuning, and app preferences.
 *
 * The panel exposes persistent settings with immediate form feedback, including
 * folder selection, UI scale controls, status choices, and app icon controls.
 * It also contains UX safeguards such as icon format warnings and drag/drop
 * affordances so setup flows remain discoverable for new users.
 *
 * New to this project: this sidebar exposes persisted app settings; trace save and picker callbacks to lifecycle/icon hooks to see what writes to config.
 */
import type { DragEvent, FocusEvent, MouseEvent, SubmitEventHandler } from 'react';
import { useState } from 'react';
import { AlertTriangle, FolderOpen, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GalleryConfig } from '../types';
import { clamp } from '../utils/app-helpers';

type AppIconSummary = {
  isValid: boolean;
  message: string;
  width: number;
  height: number;
  willPadToSquare: boolean;
};

type SetupPanelProps = {
  appVersion: string;
  config: GalleryConfig;
  isSidebarOpen: boolean;
  isSaving: boolean;
  isScanning: boolean;
  isGamesRootEditable: boolean;
  supportsFolderPicker: boolean;
  chooseLibraryFolderLabel: string;
  onSaveConfig: SubmitEventHandler<HTMLFormElement>;
  onPickRoot: () => void;
  onPickMetadataMirrorRoot: () => void;
  onRunMirrorParitySync: () => void;
  onConfigChange: (nextConfig: GalleryConfig) => void;
  onToggleSystemMenuBar: (visible: boolean) => void;
  onOpenLogViewer: () => void;
  onOpenLogFolder: () => void;
  appIconPreviewSrc: string | null;
  appIconSummary: AppIconSummary | null;
  appIconPath: string;
  onPickAppIcon: () => void;
  onDropAppIconFile: (event: DragEvent<HTMLDivElement>) => void;
  onAppIconDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  onAppIconDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  isAppIconDragActive: boolean;
  onApplyAppIconNow: () => void;
  onResetAppIcon: () => void;
};

export function SetupPanel({
  appVersion,
  config,
  isSidebarOpen,
  isSaving,
  isScanning,
  isGamesRootEditable,
  supportsFolderPicker,
  chooseLibraryFolderLabel,
  onSaveConfig,
  onPickRoot,
  onPickMetadataMirrorRoot,
  onRunMirrorParitySync,
  onConfigChange,
  onToggleSystemMenuBar,
  onOpenLogViewer,
  onOpenLogFolder,
  appIconPreviewSrc,
  appIconSummary,
  appIconPath,
  onPickAppIcon,
  onDropAppIconFile,
  onAppIconDragEnter,
  onAppIconDragLeave,
  isAppIconDragActive,
  onApplyAppIconNow,
  onResetAppIcon,
}: SetupPanelProps) {
  const { t, i18n } = useTranslation();
  const gamesRootLockedReason = t('setup.gamesRootLockedByDocker');
  const metadataMirrorRootLockedReason = t('setup.metadataMirrorRootLockedByDocker');
  const dockerManagedRootsWarning = t('setup.dockerManagedRootsWarning');
  const folderPickerUnavailableReason = t('setup.folderPickerUnavailableInBrowser');
  const metadataMirrorRootTooltip = [
    t('setup.metadataMirrorRootHint'),
    !isGamesRootEditable ? metadataMirrorRootLockedReason : '',
    isGamesRootEditable && !supportsFolderPicker ? folderPickerUnavailableReason : '',
  ].filter(Boolean).join(' ');
  const metadataMirrorParityTooltip = [
    t('setup.metadataMirrorParitySyncAction'),
    t('setup.metadataMirrorParitySyncHint'),
  ].join(' ');
  const [hoverTooltip, setHoverTooltip] = useState<{
    text: string;
    left: number;
    top: number;
  } | null>(null);

  const openHoverTooltip = (text: string, event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    // Anchor tooltip to icon trigger so pointer and keyboard focus share the same placement.
    setHoverTooltip({
      text,
      left: bounds.right + 10,
      top: bounds.top + bounds.height / 2,
    });
  };

  const closeHoverTooltip = () => {
    setHoverTooltip(null);
  };

  return (
    <>
      <aside className={`panel settings ${isSidebarOpen ? 'settings--open' : 'settings--closed'}`}>
        <form className="settings__form" onSubmit={onSaveConfig}>
          <div className="panel-heading">
            <div className="setup-heading__title-row">
              <h2>{t('setup.title')}</h2>
              {appVersion ? <span className="setup-version-tag">v{appVersion}</span> : null}
            </div>
            <p>{t('setup.savedBetweenLaunches')}</p>
          </div>

        <section className="field">
          <span>{t('setup.languageTitle')}</span>
          <div className="app-icon-actions">
            <button
              className="button button--icon"
              type="button"
              onClick={() => {
                onConfigChange({ ...config, language: 'en' });
                void i18n.changeLanguage('en');
              }}
              disabled={config.language === 'en'}
            >
              {t('setup.languageEnglish')}
            </button>
            <button
              className="button button--icon"
              type="button"
              onClick={() => {
                onConfigChange({ ...config, language: 'es' });
                void i18n.changeLanguage('es');
              }}
              disabled={config.language === 'es'}
            >
              {t('setup.languageSpanish')}
            </button>
          </div>
          <small className="field__hint">{t('setup.languageHint')}</small>
        </section>

        <section className={`setup-managed-paths ${!isGamesRootEditable ? 'setup-managed-paths--locked' : ''}`}>
          {!isGamesRootEditable ? (
            <p className="setup-managed-paths__warning">{dockerManagedRootsWarning}</p>
          ) : null}

          <label className="field">
            <span>{t('setup.gamesRoot')}</span>
            <div
              className={`field__input-with-action ${isGamesRootEditable ? '' : 'field__input-with-action--locked'}`}
              title={!isGamesRootEditable ? gamesRootLockedReason : undefined}
            >
              <input
                type="text"
                value={config.gamesRoot}
                readOnly={!isGamesRootEditable}
                aria-readonly={!isGamesRootEditable}
                onChange={(event) => onConfigChange({ ...config, gamesRoot: event.target.value })}
                placeholder={t('setup.gamesRootPlaceholder')}
                title={!isGamesRootEditable ? gamesRootLockedReason : undefined}
              />
              <button
                className="button button--icon-only field__picker-button"
                type="button"
                onClick={onPickRoot}
                disabled={isSaving || !isGamesRootEditable || !supportsFolderPicker}
                aria-label={chooseLibraryFolderLabel}
                title={
                  !isGamesRootEditable
                    ? gamesRootLockedReason
                    : !supportsFolderPicker
                      ? folderPickerUnavailableReason
                      : chooseLibraryFolderLabel
                }
              >
                <FolderOpen size={16} aria-hidden="true" />
              </button>
            </div>
            {!isGamesRootEditable ? null : !supportsFolderPicker ? (
              <small className="field__hint">{folderPickerUnavailableReason}</small>
            ) : null}
          </label>

          <label className="field">
            <div className="field__label-row">
              <span
                className="field__label-help"
                tabIndex={0}
                aria-label={metadataMirrorRootTooltip}
                onMouseEnter={(event) => openHoverTooltip(metadataMirrorRootTooltip, event)}
                onMouseLeave={closeHoverTooltip}
                onFocus={(event) => openHoverTooltip(metadataMirrorRootTooltip, event)}
                onBlur={closeHoverTooltip}
              >
                {t('setup.metadataMirrorRoot')}
              </span>
            </div>
            <div
              className={`field__input-with-action ${isGamesRootEditable ? '' : 'field__input-with-action--locked'}`}
              title={!isGamesRootEditable ? metadataMirrorRootLockedReason : undefined}
            >
              <input
                type="text"
                value={config.metadataMirrorRoot}
                readOnly={!isGamesRootEditable}
                aria-readonly={!isGamesRootEditable}
                onChange={(event) => onConfigChange({ ...config, metadataMirrorRoot: event.target.value })}
                placeholder={t('setup.metadataMirrorRootPlaceholder')}
                title={!isGamesRootEditable ? metadataMirrorRootLockedReason : undefined}
              />
              <div className="setup-mirror-actions">
                <button
                  className="button button--icon-only field__picker-button"
                  type="button"
                  onClick={onPickMetadataMirrorRoot}
                  disabled={isSaving || !isGamesRootEditable || !supportsFolderPicker}
                  aria-label={t('setup.chooseMirrorFolder')}
                  title={
                    !isGamesRootEditable
                      ? metadataMirrorRootLockedReason
                      : !supportsFolderPicker
                        ? folderPickerUnavailableReason
                        : t('setup.chooseMirrorFolder')
                  }
                >
                  <FolderOpen size={16} aria-hidden="true" />
                </button>
                <button
                  className="button button--icon-only button--danger-soft field__picker-button"
                  type="button"
                  onClick={onRunMirrorParitySync}
                  disabled={isSaving || isScanning || !isGamesRootEditable || !config.metadataMirrorRoot.trim()}
                  aria-label={t('setup.metadataMirrorParitySyncAction')}
                  onMouseEnter={(event) => openHoverTooltip(metadataMirrorParityTooltip, event)}
                  onMouseLeave={closeHoverTooltip}
                  onFocus={(event) => openHoverTooltip(metadataMirrorParityTooltip, event)}
                  onBlur={closeHoverTooltip}
                >
                  <RefreshCw size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
            {!isGamesRootEditable ? null : !supportsFolderPicker ? (
              <small className="field__hint">{folderPickerUnavailableReason}</small>
            ) : null}
          </label>
        </section>

        <label className="field">
          <span>{t('setup.excludePatterns')}</span>
          <textarea
            rows={4}
            value={config.excludePatterns.join('\n')}
            onChange={(event) =>
              onConfigChange({
                ...config,
                excludePatterns: event.target.value.split('\n').map((value) => value.trim()),
              })
            }
            placeholder=".git&#10;Thumbs.db"
          />
        </label>

        <label className="field field--toggle">
          <span>{t('setup.hideDotEntries')}</span>
          <input
            type="checkbox"
            checked={config.hideDotEntries}
            onChange={(event) => onConfigChange({ ...config, hideDotEntries: event.target.checked })}
          />
        </label>

        <label className="field">
          <span>{t('setup.versionFolderPattern')}</span>
          <input
            type="text"
            value={config.versionFolderPattern}
            onChange={(event) => onConfigChange({ ...config, versionFolderPattern: event.target.value })}
          />
        </label>

        <label className="field">
          <span>{t('setup.picturesFolderName')}</span>
          <input
            type="text"
            value={config.picturesFolderName}
            onChange={(event) => onConfigChange({ ...config, picturesFolderName: event.target.value })}
          />
        </label>

        <section className="field field--app-icon">
          <div className="field__label-row">
            <span>{t('setup.appIconPng')}</span>
            <span
              className="app-icon-warning"
              tabIndex={0}
              aria-label={t('setup.iconBehaviorDetailsAria')}
              onMouseEnter={(event) => openHoverTooltip(t('setup.appIconWarningText'), event)}
              onMouseLeave={closeHoverTooltip}
              onFocus={(event) => openHoverTooltip(t('setup.appIconWarningText'), event)}
              onBlur={closeHoverTooltip}
            >
              <AlertTriangle size={14} aria-hidden="true" />
            </span>
          </div>
          <div
            className={`app-icon-dropzone ${isAppIconDragActive ? 'app-icon-dropzone--dragover' : ''}`}
            onDragOver={(event) => {
              // Prevent browser file-open navigation and expose copy intent feedback.
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = 'copy';
            }}
            onDragEnter={onAppIconDragEnter}
            onDragLeave={onAppIconDragLeave}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDropAppIconFile(event);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onPickAppIcon();
              }
            }}
            onClick={onPickAppIcon}
            aria-label={t('setup.appIconDropAria')}
            title={t('setup.appIconDropAria')}
          >
            {appIconPreviewSrc ? (
              <img src={appIconPreviewSrc} alt={t('setup.selectedAppIconPreviewAlt')} className="app-icon-preview" />
            ) : (
              <div className="app-icon-preview app-icon-preview--placeholder" aria-hidden="true">PNG</div>
            )}
            <div className="app-icon-dropzone__meta">
              <strong>{appIconPath ? t('setup.customIconSelected') : t('setup.defaultIconInUse')}</strong>
              <p>
                {appIconPath
                  ? appIconPath
                  : t('setup.appIconDropHint')}
              </p>
            </div>
          </div>
          {appIconSummary ? (
            <small className={`field__hint ${appIconSummary.isValid ? '' : 'field__hint--error'}`}>
              {appIconSummary.message} {appIconSummary.width > 0 && appIconSummary.height > 0 ? `(${appIconSummary.width}x${appIconSummary.height}px)` : ''}
            </small>
          ) : (
            <small className="field__hint">{t('setup.appIconSizeHint')}</small>
          )}
          <div className="app-icon-actions">
            <button className="button button--icon" type="button" onClick={onApplyAppIconNow} disabled={!appIconPath}>
              {t('setup.applyNow')}
            </button>
            <button className="button button--icon" type="button" onClick={onResetAppIcon} disabled={!appIconPath}>
              {t('setup.resetToDefault')}
            </button>
          </div>
        </section>

        <label className="field">
          <span>{t('setup.statusChoices')}</span>
          <textarea
            rows={5}
            value={config.statusChoices.join('\n')}
            onChange={(event) =>
              onConfigChange({
                ...config,
                statusChoices: event.target.value.split('\n').map((value) => value.trim()),
              })
            }
            placeholder="Backlog&#10;Playing&#10;Completed"
          />
        </label>

        <label className="field">
          <span>{t('setup.posterViewColumns')}</span>
          <input
            type="number"
            min={0}
            max={12}
            value={config.posterColumns}
            onChange={(event) =>
              onConfigChange({
                ...config,
                posterColumns: Math.max(0, Number.parseInt(event.target.value || '0', 10) || 0),
              })
            }
          />
          <small className="field__hint">{t('setup.columnsHint')}</small>
        </label>

        <label className="field">
          <span>{t('setup.cardViewColumns')}</span>
          <input
            type="number"
            min={0}
            max={12}
            value={config.cardColumns}
            onChange={(event) =>
              onConfigChange({
                ...config,
                cardColumns: Math.max(0, Number.parseInt(event.target.value || '0', 10) || 0),
              })
            }
          />
          <small className="field__hint">{t('setup.columnsHint')}</small>
        </label>

        <label className="field">
          <span>{t('setup.baseFontScale')}</span>
          <input
            type="number"
            min={0.75}
            max={1.5}
            step={0.05}
            value={config.uiBaseFontScale ?? 1}
            onChange={(event) =>
              onConfigChange({
                ...config,
                uiBaseFontScale: clamp(Number.parseFloat(event.target.value || '1') || 1, 0.75, 1.5),
              })
            }
          />
          <small className="field__hint">{t('setup.baseFontScaleHint')}</small>
        </label>

        <label className="field">
          <span>{t('setup.baseSpacingScale')}</span>
          <input
            type="number"
            min={0.75}
            max={1.5}
            step={0.05}
            value={config.uiBaseSpacingScale ?? 1}
            onChange={(event) =>
              onConfigChange({
                ...config,
                uiBaseSpacingScale: clamp(Number.parseFloat(event.target.value || '1') || 1, 0.75, 1.5),
              })
            }
          />
          <small className="field__hint">{t('setup.baseSpacingScaleHint')}</small>
        </label>

        <label className="field">
          <span>{t('setup.metadataLineSpacingScale')}</span>
          <input
            type="number"
            min={0.5}
            max={4}
            step={0.05}
            value={config.uiMetadataGapScale ?? 1}
            onChange={(event) =>
              onConfigChange({
                ...config,
                uiMetadataGapScale: clamp(Number.parseFloat(event.target.value || '1') || 1, 0.5, 4),
              })
            }
          />
          <small className="field__hint">{t('setup.metadataLineSpacingHint')}</small>
        </label>

        <label className="field field--toggle">
          <span>{t('setup.dynamicScalingFromGridDensity')}</span>
          <input
            type="checkbox"
            checked={Boolean(config.uiDynamicGridScaling)}
            onChange={(event) =>
              onConfigChange({
                ...config,
                uiDynamicGridScaling: event.target.checked,
              })
            }
          />
        </label>

        <label className="field field--toggle">
          <span>{t('setup.showSystemMenuBar')}</span>
          <input
            type="checkbox"
            checked={Boolean(config.showSystemMenuBar)}
            onChange={(event) => {
              const nextVisible = event.target.checked;
              onConfigChange({
                ...config,
                showSystemMenuBar: nextVisible,
              });
              onToggleSystemMenuBar(nextVisible);
            }}
          />
        </label>

        <label className="field">
          <span>{t('setup.globalZoom')}</span>
          <input
            type="number"
            min={0.75}
            max={2}
            step={0.05}
            value={config.uiGlobalZoom ?? 1}
            onChange={(event) =>
              onConfigChange({
                ...config,
                uiGlobalZoom: clamp(Number.parseFloat(event.target.value || '1') || 1, 0.75, 2),
              })
            }
          />
          <small className="field__hint">{t('setup.globalZoomHint')}</small>
        </label>

        <div className="setup-log-actions">
          <button className="button button--icon" type="button" onClick={onOpenLogViewer}>
            {t('setup.viewLogs')}
          </button>
          <button className="button button--icon" type="button" onClick={onOpenLogFolder}>
            {t('setup.openLogsFolder')}
          </button>
        </div>

        <button className="button button--primary" type="submit" disabled={isSaving}>
          {isSaving ? t('actions.saving') : t('setup.saveSetup')}
        </button>
        </form>
      </aside>
      {hoverTooltip ? (
        <div
          className="app-icon-warning-layer"
          role="tooltip"
          style={{ left: `${hoverTooltip.left}px`, top: `${hoverTooltip.top}px` }}
        >
          {hoverTooltip.text}
        </div>
      ) : null}
    </>
  );
}






