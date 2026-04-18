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
import type { GalleryConfig } from '../types';
import { SetupPanel as SharedSetupPanel } from '../../../shared/app-shell/components/SetupPanel';

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
  return (
    <SharedSetupPanel<GalleryConfig>
      appVersion={appVersion}
      config={config}
      isSidebarOpen={isSidebarOpen}
      isSaving={isSaving}
      isScanning={isScanning}
      isGamesRootEditable={isGamesRootEditable}
      supportsFolderPicker={supportsFolderPicker}
      chooseLibraryFolderLabel={chooseLibraryFolderLabel}
      onSaveConfig={onSaveConfig}
      onPickRoot={onPickRoot}
      onPickMetadataMirrorRoot={onPickMetadataMirrorRoot}
      onRunMirrorParitySync={onRunMirrorParitySync}
      onConfigChange={onConfigChange}
      onToggleSystemMenuBar={onToggleSystemMenuBar}
      onOpenLogViewer={onOpenLogViewer}
      onOpenLogFolder={onOpenLogFolder}
      supportsAppIconPicker={true}
      appIconPreviewSrc={appIconPreviewSrc}
      appIconSummary={appIconSummary}
      appIconPath={appIconPath}
      onPickAppIcon={onPickAppIcon}
      onDropAppIconFile={onDropAppIconFile}
      onAppIconDragEnter={onAppIconDragEnter}
      onAppIconDragLeave={onAppIconDragLeave}
      isAppIconDragActive={isAppIconDragActive}
      onApplyAppIconNow={onApplyAppIconNow}
      onResetAppIcon={onResetAppIcon}
    />
  );
}






