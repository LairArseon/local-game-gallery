/**
 * Setup sidebar for library paths, layout settings, and app preferences.
 */
import type { FormEvent } from 'react';
import { FolderOpen } from 'lucide-react';
import type { GalleryConfig } from '../types';
import { clamp } from '../utils/app-helpers';

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
}: SetupPanelProps) {
  return (
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
  );
}
