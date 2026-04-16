import { execFile } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function toWindowsPath(value) {
  return value.replace(/\//g, '\\\\');
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureExists(targetPath, label) {
  if (!(await pathExists(targetPath))) {
    throw new Error(`Missing ${label}: ${targetPath}`);
  }
}

async function findMakensisFromCache() {
  const cacheRoot = path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache', 'nsis');
  if (!(await pathExists(cacheRoot))) {
    return null;
  }

  const firstLevel = await readdir(cacheRoot, { withFileTypes: true });
  for (const entry of firstLevel) {
    if (!entry.isDirectory()) {
      continue;
    }

    const candidate = path.join(cacheRoot, entry.name, 'Bin', 'makensis.exe');
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function findMakensis() {
  const envOverride = String(process.env.MAKENSIS_PATH ?? '').trim();
  if (envOverride && (await pathExists(envOverride))) {
    return envOverride;
  }

  try {
    const { stdout } = await execFileAsync('where', ['makensis.exe'], {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    const firstMatch = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    if (firstMatch) {
      return firstMatch;
    }
  } catch {
    // Fall back to electron-builder cache lookup.
  }

  return findMakensisFromCache();
}

async function cleanupOldBundleInstallers(outputDir, keepFileName) {
  if (!(await pathExists(outputDir))) {
    return;
  }

  const entries = await readdir(outputDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    if (!/^Local Game Gallery Bundle Setup .+\.exe$/i.test(entry.name)) {
      continue;
    }

    if (entry.name === keepFileName) {
      continue;
    }

    await rm(path.join(outputDir, entry.name), { force: true });
  }
}

function createNsisScript({ outputExePath, payloadDirPath, appVersion }) {
  const outputPathWindows = toWindowsPath(outputExePath);
  const payloadPathWindows = toWindowsPath(payloadDirPath);
  const normalizedAppVersion = String(appVersion ?? '0.0.0').trim() || '0.0.0';

  const lines = [
    '!include "MUI2.nsh"',
    '!include "LogicLib.nsh"',
    '!include "Sections.nsh"',
    '',
    '!define APP_NAME "Local Game Gallery Bundle"',
    '!define APP_PUBLISHER "Lair Arseon"',
    '!define APP_VERSION "__APP_VERSION__"',
    '!define QUOTE $\\"',
    '!define UNINSTALL_REG_KEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\LocalGameGalleryBundle"',
    '!define DEFAULT_ICON $INSTDIR\\icon\\icon.ico',
    '!define SERVICE_ICON $INSTDIR\\icon\\service-icon\\icon.ico',
    '!define WEB_ICON $INSTDIR\\icon\\web-client-icon\\icon.ico',
    '!define DESKTOP_ICON $INSTDIR\\icon\\standalone-client-icon\\icon.ico',
    '',
    'Unicode true',
    'Name "${APP_NAME} Installer"',
    'OutFile "__OUTPUT_EXE__"',
    'InstallDir "$PROGRAMFILES64\\Local Game Gallery"',
    'InstallDirRegKey HKLM "Software\\LocalGameGalleryBundle" "InstallDir"',
    'RequestExecutionLevel admin',
    'ShowInstDetails show',
    'ShowUnInstDetails show',
    'BrandingText "Local Game Gallery"',
    '',
    '!define PAYLOAD_DIR "__PAYLOAD_DIR__"',
    '!define START_MENU_DIR "Local Game Gallery"',
    '',
    '!insertmacro MUI_PAGE_WELCOME',
    '!insertmacro MUI_PAGE_COMPONENTS',
    '!insertmacro MUI_PAGE_DIRECTORY',
    '!insertmacro MUI_PAGE_INSTFILES',
    '!insertmacro MUI_PAGE_FINISH',
    '!insertmacro MUI_UNPAGE_CONFIRM',
    '!insertmacro MUI_UNPAGE_INSTFILES',
    '!insertmacro MUI_LANGUAGE "English"',
    '',
    'Section "Gallery Service" SEC_SERVICE',
    '  Call EnsureRuntimePayload',
    '  SetOutPath "$INSTDIR\\dist-electron\\electron"',
    '  File /r "${PAYLOAD_DIR}\\dist-electron\\electron\\*"',
    '',
    '  Call EnsureStartMenuFolder',
    '  CreateShortCut "$SMPROGRAMS\\${START_MENU_DIR}\\Gallery Service Tray.lnk" "$INSTDIR\\runtime\\electron\\electron.exe" "${QUOTE}$INSTDIR\\dist-electron\\electron\\service-tray.js${QUOTE}" "${SERVICE_ICON}" 0',
    '  CreateShortCut "$DESKTOP\\Gallery Service Tray.lnk" "$INSTDIR\\runtime\\electron\\electron.exe" "${QUOTE}$INSTDIR\\dist-electron\\electron\\service-tray.js${QUOTE}" "${SERVICE_ICON}" 0',
    'SectionEnd',
    '',
    'Section "Web Client (Tray Host + Browser URL)" SEC_WEB',
    '  Call EnsureRuntimePayload',
    '  SetOutPath "$INSTDIR\\dist-electron\\electron"',
    '  File /r "${PAYLOAD_DIR}\\dist-electron\\electron\\*"',
    '',
    '  SetOutPath "$INSTDIR\\dist-web-client"',
    '  File /r "${PAYLOAD_DIR}\\dist-web-client\\*"',
    '',
    '  Call EnsureStartMenuFolder',
    '  CreateShortCut "$SMPROGRAMS\\${START_MENU_DIR}\\Web Client Tray Host.lnk" "$INSTDIR\\runtime\\electron\\electron.exe" "${QUOTE}$INSTDIR\\dist-electron\\electron\\web-client-tray.js${QUOTE}" "${WEB_ICON}" 0',
    '  CreateShortCut "$DESKTOP\\Web Client Tray Host.lnk" "$INSTDIR\\runtime\\electron\\electron.exe" "${QUOTE}$INSTDIR\\dist-electron\\electron\\web-client-tray.js${QUOTE}" "${WEB_ICON}" 0',
    'SectionEnd',
    '',
    'Section /o "Start with Windows (Service + Web Client)" SEC_AUTOSTART',
    'SectionEnd',
    '',
    'Section "Desktop Client" SEC_DESKTOP',
    '  Call EnsureRuntimePayload',
    '',
    '  SetOutPath "$INSTDIR\\dist-standalone-electron\\electron"',
    '  File /r "${PAYLOAD_DIR}\\dist-standalone-electron\\electron\\*"',
    '',
    '  SetOutPath "$INSTDIR\\dist-standalone-client"',
    '  File /r "${PAYLOAD_DIR}\\dist-standalone-client\\*"',
    '',
    '  Call EnsureStartMenuFolder',
    '  CreateShortCut "$SMPROGRAMS\\${START_MENU_DIR}\\Desktop Client.lnk" "$INSTDIR\\runtime\\electron\\electron.exe" "${QUOTE}$INSTDIR\\dist-standalone-electron\\electron\\main.js${QUOTE}" "${DESKTOP_ICON}" 0',
    '  CreateShortCut "$DESKTOP\\Desktop Client.lnk" "$INSTDIR\\runtime\\electron\\electron.exe" "${QUOTE}$INSTDIR\\dist-standalone-electron\\electron\\main.js${QUOTE}" "${DESKTOP_ICON}" 0',
    'SectionEnd',
    '',
    'Section "-PostInstall" SEC_POST',
    '  WriteRegStr HKLM "Software\\LocalGameGalleryBundle" "InstallDir" "$INSTDIR"',
    '  WriteUninstaller "$INSTDIR\\Uninstall Local Game Gallery Bundle.exe"',
    '  Call EnsureStartMenuFolder',
    '  CreateShortCut "$SMPROGRAMS\\${START_MENU_DIR}\\Uninstall Local Game Gallery Bundle.lnk" "$INSTDIR\\Uninstall Local Game Gallery Bundle.exe" "" "${DEFAULT_ICON}" 0',
    '  ${If} ${SectionIsSelected} ${SEC_AUTOSTART}',
    '    ${If} ${SectionIsSelected} ${SEC_SERVICE}',
    '      CreateShortCut "$SMSTARTUP\\Gallery Service Tray.lnk" "$INSTDIR\\runtime\\electron\\electron.exe" "${QUOTE}$INSTDIR\\dist-electron\\electron\\service-tray.js${QUOTE}" "${SERVICE_ICON}" 0',
    '    ${EndIf}',
    '    ${If} ${SectionIsSelected} ${SEC_WEB}',
    '      CreateShortCut "$SMSTARTUP\\Web Client Tray Host.lnk" "$INSTDIR\\runtime\\electron\\electron.exe" "${QUOTE}$INSTDIR\\dist-electron\\electron\\web-client-tray.js${QUOTE}" "${WEB_ICON}" 0',
    '    ${EndIf}',
    '  ${Else}',
    '    Delete "$SMSTARTUP\\Gallery Service Tray.lnk"',
    '    Delete "$SMSTARTUP\\Web Client Tray Host.lnk"',
    '  ${EndIf}',
    '  WriteRegStr HKLM "${UNINSTALL_REG_KEY}" "DisplayName" "${APP_NAME}"',
    '  WriteRegStr HKLM "${UNINSTALL_REG_KEY}" "DisplayVersion" "${APP_VERSION}"',
    '  WriteRegStr HKLM "${UNINSTALL_REG_KEY}" "Publisher" "${APP_PUBLISHER}"',
    '  WriteRegStr HKLM "${UNINSTALL_REG_KEY}" "InstallLocation" "$INSTDIR"',
    '  WriteRegStr HKLM "${UNINSTALL_REG_KEY}" "UninstallString" "${QUOTE}$INSTDIR\\Uninstall Local Game Gallery Bundle.exe${QUOTE}"',
    '  WriteRegStr HKLM "${UNINSTALL_REG_KEY}" "QuietUninstallString" "${QUOTE}$INSTDIR\\Uninstall Local Game Gallery Bundle.exe${QUOTE} /S"',
    '  WriteRegStr HKLM "${UNINSTALL_REG_KEY}" "DisplayIcon" "${DEFAULT_ICON}"',
    '  WriteRegDWORD HKLM "${UNINSTALL_REG_KEY}" "NoModify" 1',
    '  WriteRegDWORD HKLM "${UNINSTALL_REG_KEY}" "NoRepair" 1',
    'SectionEnd',
    '',
    'Function EnsureRuntimePayload',
    '  SetOutPath "$INSTDIR\\runtime\\electron"',
    '  File /r "${PAYLOAD_DIR}\\runtime\\electron-dist\\*"',
    '',
    '  SetOutPath "$INSTDIR\\icon"',
    '  File /r "${PAYLOAD_DIR}\\icon\\*"',
    'FunctionEnd',
    '',
    'Function EnsureStartMenuFolder',
    '  CreateDirectory "$SMPROGRAMS\\${START_MENU_DIR}"',
    'FunctionEnd',
    '',
    'Function .onSelChange',
    '  ${If} ${SectionIsSelected} ${SEC_AUTOSTART}',
    '    !insertmacro SelectSection ${SEC_WEB}',
    '    !insertmacro SelectSection ${SEC_SERVICE}',
    '  ${EndIf}',

    '  ${If} ${SectionIsSelected} ${SEC_WEB}',
    '    !insertmacro SelectSection ${SEC_SERVICE}',
    '  ${EndIf}',
    '',
    '  ${If} ${SectionIsSelected} ${SEC_DESKTOP}',
    '    !insertmacro SelectSection ${SEC_SERVICE}',
    '  ${EndIf}',
    'FunctionEnd',
    '',
    'Section "Uninstall"',
    '  Delete "$SMSTARTUP\\Gallery Service Tray.lnk"',
    '  Delete "$SMSTARTUP\\Web Client Tray Host.lnk"',
    '  Delete "$DESKTOP\\Gallery Service Tray.lnk"',
    '  Delete "$DESKTOP\\Web Client Tray Host.lnk"',
    '  Delete "$DESKTOP\\Desktop Client.lnk"',
    '  Delete "$SMPROGRAMS\\${START_MENU_DIR}\\Gallery Service Tray.lnk"',
    '  Delete "$SMPROGRAMS\\${START_MENU_DIR}\\Web Client Tray Host.lnk"',
    '  Delete "$SMPROGRAMS\\${START_MENU_DIR}\\Desktop Client.lnk"',
    '  Delete "$SMPROGRAMS\\${START_MENU_DIR}\\Uninstall Local Game Gallery Bundle.lnk"',
    '  RMDir "$SMPROGRAMS\\${START_MENU_DIR}"',
    '',
    '  RMDir /r "$INSTDIR\\dist-electron"',
    '  RMDir /r "$INSTDIR\\dist-web-client"',
    '  RMDir /r "$INSTDIR\\dist-standalone-electron"',
    '  RMDir /r "$INSTDIR\\dist-standalone-client"',
    '  RMDir /r "$INSTDIR\\runtime"',
    '  RMDir /r "$INSTDIR\\icon"',
    '',
    '  Delete "$INSTDIR\\Uninstall Local Game Gallery Bundle.exe"',
    '  DeleteRegKey HKLM "${UNINSTALL_REG_KEY}"',
    '  DeleteRegKey HKLM "Software\\LocalGameGalleryBundle"',
    '  RMDir "$INSTDIR"',
    'SectionEnd',
    '',
  ];

  return lines
    .join('\n')
    .replace(/__OUTPUT_EXE__/g, outputPathWindows)
    .replace(/__PAYLOAD_DIR__/g, payloadPathWindows)
    .replace(/__APP_VERSION__/g, normalizedAppVersion);
}

async function main() {
  if (process.platform !== 'win32') {
    throw new Error('Bundle installer build is currently supported on Windows only.');
  }

  const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptsDir, '..');

  const packageJsonPath = path.join(repoRoot, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const appVersion = String(packageJson.version ?? '').trim() || '0.0.0';

  const outputDir = path.join(repoRoot, 'installer', 'bundle');
  const stageDir = path.join(outputDir, '.stage');
  const payloadDir = path.join(stageDir, 'payload');
  const outputExePath = path.join(outputDir, `Local Game Gallery Bundle Setup ${appVersion}.exe`);
  const nsisScriptPath = path.join(stageDir, 'bundle-installer.nsi');

  const requiredPaths = {
    runtime: path.join(repoRoot, 'node_modules', 'electron', 'dist'),
    distElectron: path.join(repoRoot, 'dist-electron', 'electron'),
    distWebClient: path.join(repoRoot, 'dist-web-client'),
    distStandaloneElectron: path.join(repoRoot, 'dist-standalone-electron', 'electron'),
    distStandaloneClient: path.join(repoRoot, 'dist-standalone-client'),
    icon: path.join(repoRoot, 'icon'),
  };

  await ensureExists(requiredPaths.runtime, 'Electron runtime');
  await ensureExists(requiredPaths.distElectron, 'service/web tray runtime bundle');
  await ensureExists(requiredPaths.distWebClient, 'web client bundle');
  await ensureExists(requiredPaths.distStandaloneElectron, 'standalone electron bundle');
  await ensureExists(requiredPaths.distStandaloneClient, 'standalone renderer bundle');
  await ensureExists(requiredPaths.icon, 'icon assets');

  await rm(stageDir, { recursive: true, force: true });
  await mkdir(payloadDir, { recursive: true });

  await cp(requiredPaths.runtime, path.join(payloadDir, 'runtime', 'electron-dist'), { recursive: true });
  await cp(requiredPaths.distElectron, path.join(payloadDir, 'dist-electron', 'electron'), { recursive: true });
  await cp(requiredPaths.distWebClient, path.join(payloadDir, 'dist-web-client'), { recursive: true });
  await cp(requiredPaths.distStandaloneElectron, path.join(payloadDir, 'dist-standalone-electron', 'electron'), { recursive: true });
  await cp(requiredPaths.distStandaloneClient, path.join(payloadDir, 'dist-standalone-client'), { recursive: true });
  await cp(requiredPaths.icon, path.join(payloadDir, 'icon'), { recursive: true });

  const nsisScript = createNsisScript({
    outputExePath,
    payloadDirPath: payloadDir,
    appVersion,
  });
  await writeFile(nsisScriptPath, nsisScript, 'utf8');

  const makensisPath = await findMakensis();
  if (!makensisPath) {
    throw new Error('makensis.exe not found. Install NSIS or set MAKENSIS_PATH.');
  }

  console.log(`[bundle-installer] using makensis: ${makensisPath}`);
  console.log('[bundle-installer] compiling installer...');

  let stdout = '';
  let stderr = '';

  try {
    const result = await execFileAsync(makensisPath, [nsisScriptPath], {
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } finally {
    await rm(stageDir, { recursive: true, force: true });
  }

  if (stdout.trim()) {
    console.log(stdout.trim());
  }
  if (stderr.trim()) {
    console.error(stderr.trim());
  }

  try {
    await cleanupOldBundleInstallers(outputDir, path.basename(outputExePath));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[bundle-installer] warning: failed to prune stale bundle installers: ${message}`);
  }

  console.log(`[bundle-installer] output: ${outputExePath}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[bundle-installer] failed: ${message}`);
  process.exitCode = 1;
});
