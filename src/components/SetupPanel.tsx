/**
 * Setup sidebar for library paths, layout settings, and app preferences.
 */
import type { DragEvent, FocusEvent, FormEvent, MouseEvent } from 'react';
import { useState } from 'react';
import { AlertTriangle, FolderOpen } from 'lucide-react';
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
  config: GalleryConfig;
  isSidebarOpen: boolean;
  isSaving: boolean;
  chooseLibraryFolderLabel: string;
  onSaveConfig: (event: FormEvent<HTMLFormElement>) => void;
  onPickRoot: () => void;
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
  config,
  isSidebarOpen,
  isSaving,
  chooseLibraryFolderLabel,
  onSaveConfig,
  onPickRoot,
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
  const [isIconWarningOpen, setIsIconWarningOpen] = useState(false);
  const [iconWarningPosition, setIconWarningPosition] = useState<{ left: number; top: number } | null>(null);

  const openIconWarning = (event: MouseEvent<HTMLSpanElement> | FocusEvent<HTMLSpanElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setIconWarningPosition({
      left: bounds.right + 10,
      top: bounds.top + bounds.height / 2,
    });
    setIsIconWarningOpen(true);
  };

  const closeIconWarning = () => {
    setIsIconWarningOpen(false);
  };

  return (
    <>
      <aside className={`panel settings ${isSidebarOpen ? 'settings--open' : 'settings--closed'}`}>
        <form onSubmit={onSaveConfig}>
        <div className="panel-heading">
          <h2>Setup</h2>
          <p>Configuration is saved between app launches.</p>
        </div>

        <label className="field">
          <span>Games root</span>
          <div className="field__input-with-action">
            <input
              type="text"
              value={config.gamesRoot}
              onChange={(event) => onConfigChange({ ...config, gamesRoot: event.target.value })}
              placeholder="D:\\Games or /home/you/Games"
            />
            <button
              className="button button--icon-only field__picker-button"
              type="button"
              onClick={onPickRoot}
              disabled={isSaving}
              aria-label={chooseLibraryFolderLabel}
              title={chooseLibraryFolderLabel}
            >
              <FolderOpen size={16} aria-hidden="true" />
            </button>
          </div>
        </label>

        <label className="field">
          <span>Exclude patterns</span>
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
          <span>Hide dot-prefixed files and folders</span>
          <input
            type="checkbox"
            checked={config.hideDotEntries}
            onChange={(event) => onConfigChange({ ...config, hideDotEntries: event.target.checked })}
          />
        </label>

        <label className="field">
          <span>Version folder pattern</span>
          <input
            type="text"
            value={config.versionFolderPattern}
            onChange={(event) => onConfigChange({ ...config, versionFolderPattern: event.target.value })}
          />
        </label>

        <label className="field">
          <span>Pictures folder name</span>
          <input
            type="text"
            value={config.picturesFolderName}
            onChange={(event) => onConfigChange({ ...config, picturesFolderName: event.target.value })}
          />
        </label>

        <section className="field field--app-icon">
          <div className="field__label-row">
            <span>App icon (PNG)</span>
            <span
              className="app-icon-warning"
              tabIndex={0}
              aria-label="Icon behavior details"
              onMouseEnter={openIconWarning}
              onMouseLeave={closeIconWarning}
              onFocus={openIconWarning}
              onBlur={closeIconWarning}
            >
              <AlertTriangle size={14} aria-hidden="true" />
            </span>
          </div>
          <div
            className={`app-icon-dropzone ${isAppIconDragActive ? 'app-icon-dropzone--dragover' : ''}`}
            onDragOver={(event) => {
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
            aria-label="Drop PNG icon here or click to select"
            title="Drop PNG icon here or click to select"
          >
            {appIconPreviewSrc ? (
              <img src={appIconPreviewSrc} alt="Selected app icon preview" className="app-icon-preview" />
            ) : (
              <div className="app-icon-preview app-icon-preview--placeholder" aria-hidden="true">PNG</div>
            )}
            <div className="app-icon-dropzone__meta">
              <strong>{appIconPath ? 'Custom icon selected' : 'Default icon in use'}</strong>
              <p>
                {appIconPath
                  ? appIconPath
                  : 'Drop a PNG file or click to choose one for future installer builds.'}
              </p>
            </div>
          </div>
          {appIconSummary ? (
            <small className={`field__hint ${appIconSummary.isValid ? '' : 'field__hint--error'}`}>
              {appIconSummary.message} {appIconSummary.width > 0 && appIconSummary.height > 0 ? `(${appIconSummary.width}x${appIconSummary.height}px)` : ''}
            </small>
          ) : (
            <small className="field__hint">Use at least 256x256 PNG. Non-square icons are padded to square automatically.</small>
          )}
          <div className="app-icon-actions">
            <button className="button button--icon" type="button" onClick={onApplyAppIconNow} disabled={!appIconPath}>
              Apply now
            </button>
            <button className="button button--icon" type="button" onClick={onResetAppIcon} disabled={!appIconPath}>
              Reset to default
            </button>
          </div>
        </section>

        <label className="field">
          <span>Status choices</span>
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
          <span>Poster view columns</span>
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
          <small className="field__hint">Use 0 to auto-fit columns based on current element size.</small>
        </label>

        <label className="field">
          <span>Card view columns</span>
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
          <small className="field__hint">Use 0 to auto-fit columns based on current element size.</small>
        </label>

        <label className="field">
          <span>Base font scale</span>
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
          <small className="field__hint">Affects only game content cards/lists/detail, not setup or top menus.</small>
        </label>

        <label className="field">
          <span>Base spacing scale</span>
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
          <small className="field__hint">Affects only game content spacing.</small>
        </label>

        <label className="field">
          <span>Metadata line spacing scale</span>
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
          <small className="field__hint">Controls spacing between metadata lines in poster/card/expanded views and scales with font size.</small>
        </label>

        <label className="field field--toggle">
          <span>Dynamic scaling from grid density</span>
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
          <span>Show system menu bar</span>
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
          <span>Global zoom</span>
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
          <small className="field__hint">Also works with Ctrl + mouse wheel and +/- keys. Ctrl+0 resets to 100%.</small>
        </label>

        <div className="setup-log-actions">
          <button className="button button--icon" type="button" onClick={onOpenLogViewer}>
            View logs
          </button>
          <button className="button button--icon" type="button" onClick={onOpenLogFolder}>
            Open logs folder
          </button>
        </div>

        <button className="button button--primary" type="submit" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save setup'}
        </button>
        </form>
      </aside>
      {isIconWarningOpen && iconWarningPosition ? (
        <div
          className="app-icon-warning-layer"
          role="tooltip"
          style={{ left: `${iconWarningPosition.left}px`, top: `${iconWarningPosition.top}px` }}
        >
          Custom PNG icons update preview immediately, can be applied for the current session, and are used on next app startup.
          Packaged executable and installer icons are build-time assets on Windows, so true installed identity changes still require rebuilding.
        </div>
      ) : null}
    </>
  );
}
