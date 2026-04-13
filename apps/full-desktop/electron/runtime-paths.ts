import os from 'node:os';
import path from 'node:path';

type ElectronAppLike = {
  getPath: (name: 'userData') => string;
};

let cachedGalleryDataPath: string | null = null;

async function resolveElectronUserDataPath() {
  if (!process.versions.electron) {
    return null;
  }

  try {
    const electronModule = await import('electron') as unknown as { app?: ElectronAppLike };
    const electronApp = electronModule.app;
    if (!electronApp) {
      return null;
    }

    return electronApp.getPath('userData');
  } catch {
    return null;
  }
}

export async function resolveGalleryDataPath() {
  if (cachedGalleryDataPath) {
    return cachedGalleryDataPath;
  }

  const configuredDataPath = String(process.env.LGG_DATA_DIR ?? '').trim();
  if (configuredDataPath) {
    cachedGalleryDataPath = path.resolve(configuredDataPath);
    return cachedGalleryDataPath;
  }

  const electronUserDataPath = await resolveElectronUserDataPath();
  if (electronUserDataPath) {
    cachedGalleryDataPath = path.resolve(electronUserDataPath);
    return cachedGalleryDataPath;
  }

  cachedGalleryDataPath = path.join(os.homedir(), '.local-game-gallery');
  return cachedGalleryDataPath;
}
