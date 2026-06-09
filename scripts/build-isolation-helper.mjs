import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const optionalMode = process.argv.includes('--optional');
const helperExecutableName = 'LocalGameGallery.IsolationHelper.exe';
const helperVersionManifestName = 'helper-version.json';

function fail(message) {
  if (optionalMode) {
    console.warn(`[isolation-helper] skipped: ${message}`);
    process.exitCode = 0;
    return false;
  }

  throw new Error(message);
}

async function main() {
  if (process.platform !== 'win32') {
    if (!fail(`unsupported platform ${process.platform}`)) {
      return;
    }
  }

  const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptsDir, '..');
  const projectPath = path.join(repoRoot, 'apps', 'isolation-module', 'helper', 'LocalGameGallery.IsolationHelper.csproj');
  const outputDir = path.join(repoRoot, 'dist-electron', 'electron', 'isolation-helper');
  const packageJsonPath = path.join(repoRoot, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const appVersion = String(packageJson.version ?? '').trim();

  if (!appVersion) {
    throw new Error(`missing package.json version in ${packageJsonPath}`);
  }

  const assemblyVersion = `${appVersion}.0`;

  let sdkListOutput = '';
  try {
    const result = await execFileAsync('dotnet', ['--list-sdks'], {
      cwd: repoRoot,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    sdkListOutput = result.stdout.trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!fail(`dotnet SDK check failed: ${message}`)) {
      return;
    }
  }

  if (!sdkListOutput) {
    if (!fail('No .NET SDK was found. Install the .NET SDK to build the Isolation helper.')) {
      return;
    }
  }

  await rm(outputDir, { recursive: true, force: true }).catch(() => undefined);
  await mkdir(outputDir, { recursive: true });

  await execFileAsync('dotnet', [
    'publish',
    projectPath,
    '-c', 'Release',
    '-r', 'win-x64',
    '--self-contained', 'true',
    `-p:Version=${appVersion}`,
    `-p:AssemblyVersion=${assemblyVersion}`,
    `-p:FileVersion=${assemblyVersion}`,
    `-p:InformationalVersion=${appVersion}`,
    '-p:PublishSingleFile=true',
    '-p:PublishTrimmed=false',
    '-o', outputDir,
  ], {
    cwd: repoRoot,
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });

  const helperVersionManifest = {
    appVersion,
    helperVersion: appVersion,
    compatibility: 'exact',
    executableName: helperExecutableName,
  };

  await writeFile(
    path.join(outputDir, helperVersionManifestName),
    JSON.stringify(helperVersionManifest, null, 2),
    'utf8',
  );

  console.log(`[isolation-helper] published ${helperExecutableName} ${appVersion} to ${outputDir}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[isolation-helper] failed: ${message}`);
  process.exitCode = 1;
});
