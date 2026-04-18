/**
 * Shared transport and save primitives for download flows.
 */

export type SaveFileHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

export type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options?: { suggestedName?: string }) => Promise<SaveFileHandle>;
};

export type DesktopSaveResult = {
  canceled: boolean;
  saved: boolean;
  message: string;
};

export type Translate = (key: string, options?: Record<string, unknown>) => string;

export type LogAppEvent = (
  message: string,
  level?: 'info' | 'warn' | 'error',
  source?: string,
) => Promise<void>;
