import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type {
  LaunchIsolationProvider,
  LaunchIsolationRequest,
  LaunchIsolationSession,
} from './launch-isolation-provider';

type FirewallHelperRequest = {
  requestId: string;
  action: 'create' | 'remove';
  ruleGroup: string;
  executablePath?: string;
  gameName?: string;
};

type FirewallHelperResponse = {
  ok: boolean;
  requestId: string;
  message?: string;
  processedAt: string;
};

const helperRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'LocalGameGallery', 'firewall-helper');
const helperRequestsPath = path.join(helperRoot, 'requests');
const helperResponsesPath = path.join(helperRoot, 'responses');
const helperWorkerScriptPath = path.join(helperRoot, 'worker.ps1');
const powerShellTaskName = 'LocalGameGallery Firewall Helper';
const nativeHelperTaskName = 'LocalGameGallery Isolation Helper';
const helperExecutableName = 'LocalGameGallery.IsolationHelper.exe';
const helperVersionManifestName = 'helper-version.json';

type HelperCompatibility = 'compatible' | 'manifest-missing' | 'invalid-manifest';

type HelperVersionManifest = {
  appVersion?: string;
  helperVersion?: string;
  compatibility?: string;
  executableName?: string;
};

type NativeHelperCandidate = {
  executablePath: string;
  helperVersion: string | null;
  builtForAppVersion: string | null;
  manifestPath: string | null;
  compatibility: HelperCompatibility;
  compatibilityMessage: string;
};

type HelperBackend =
  | {
    kind: 'native';
    taskName: string;
    executablePath: string;
    helperVersion: string | null;
  }
  | {
    kind: 'powershell';
    taskName: string;
    workerScriptPath: string;
  };

const helperInstallPromises = new Map<string, Promise<void>>();

function toPowerShellSingleQuoted(value: string) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

async function runPowerShell(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const processHandle = spawn('powershell.exe', args, {
      stdio: 'ignore',
      windowsHide: true,
    });

    processHandle.once('error', (error) => reject(error));
    processHandle.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`PowerShell exited with code ${code ?? -1}.`));
    });
  });
}

async function runPowerShellWithOutput(args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const processHandle = spawn('powershell.exe', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    processHandle.stdout?.on('data', (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    processHandle.stderr?.on('data', (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });

    processHandle.once('error', (error) => reject(error));
    processHandle.once('exit', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim();
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();

      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(stderr || stdout || `PowerShell exited with code ${code ?? -1}.`));
    });
  });
}

async function waitForFile(filePath: string, timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await stat(filePath);
      return;
    } catch {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 250);
      });
    }
  }

  throw new Error(`Timed out waiting for helper response file "${filePath}".`);
}

function normalizeComparableText(value: string | null | undefined) {
  return String(value ?? '').trim().replace(/^"|"$/g, '').toLowerCase();
}

function normalizeComparablePath(value: string | null | undefined) {
  const normalizedValue = normalizeComparableText(value);
  if (!normalizedValue) {
    return '';
  }

  return path.normalize(normalizedValue).toLowerCase();
}

function normalizeVersion(value: string | null | undefined) {
  return String(value ?? '').trim();
}

function readJsonFileIfPresent<T>(filePath: string) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function resolveNativeHelperCandidate(): NativeHelperCandidate | null {
  const electronResourcesPath = typeof (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath === 'string'
    ? (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
    : '';
  const candidatePaths = [
    path.join(__dirname, 'isolation-helper', helperExecutableName),
    path.join(__dirname, '..', 'electron', 'isolation-helper', helperExecutableName),
    path.join(process.cwd(), 'dist-electron', 'electron', 'isolation-helper', helperExecutableName),
    path.join(path.dirname(process.execPath), 'resources', 'app.asar.unpacked', 'dist-electron', 'electron', 'isolation-helper', helperExecutableName),
    electronResourcesPath
      ? path.join(electronResourcesPath, 'app.asar.unpacked', 'dist-electron', 'electron', 'isolation-helper', helperExecutableName)
      : '',
  ];
  let firstDetectedCandidate: NativeHelperCandidate | null = null;

  for (const candidatePath of candidatePaths) {
    if (!candidatePath || !existsSync(candidatePath)) {
      continue;
    }

    const manifestPath = path.join(path.dirname(candidatePath), helperVersionManifestName);
    const manifest = existsSync(manifestPath)
      ? readJsonFileIfPresent<HelperVersionManifest>(manifestPath)
      : null;
    const helperVersion = normalizeVersion(manifest?.helperVersion) || null;
    const builtForAppVersion = normalizeVersion(manifest?.appVersion) || null;
    let compatibility: HelperCompatibility = 'compatible';
    let compatibilityMessage = 'Native helper manifest is present and usable.';

    if (!existsSync(manifestPath)) {
      compatibility = 'manifest-missing';
      compatibilityMessage = `Version manifest "${helperVersionManifestName}" is missing next to the helper executable.`;
    } else if (!manifest || (!helperVersion && !builtForAppVersion)) {
      compatibility = 'invalid-manifest';
      compatibilityMessage = `Version manifest "${helperVersionManifestName}" is invalid.`;
    }

    const candidate = {
      executablePath: candidatePath,
      helperVersion,
      builtForAppVersion,
      manifestPath: existsSync(manifestPath) ? manifestPath : null,
      compatibility,
      compatibilityMessage,
    };

    if (!firstDetectedCandidate) {
      firstDetectedCandidate = candidate;
    }

    if (candidate.compatibility === 'compatible') {
      return candidate;
    }
  }

  return firstDetectedCandidate;
}

function resolveNativeHelperExecutablePath() {
  return resolveNativeHelperCandidate()?.executablePath ?? null;
}

function resolveHelperBackend(): HelperBackend {
  const nativeHelperCandidate = resolveNativeHelperCandidate();
  if (nativeHelperCandidate?.compatibility === 'compatible') {
    return {
      kind: 'native',
      taskName: nativeHelperTaskName,
      executablePath: nativeHelperCandidate.executablePath,
      helperVersion: nativeHelperCandidate.helperVersion,
    };
  }

  return {
    kind: 'powershell',
    taskName: powerShellTaskName,
    workerScriptPath: helperWorkerScriptPath,
  };
}

export function getWindowsFirewallIsolationDiagnostics() {
  if (process.platform !== 'win32') {
    return {
      providerId: 'windows-firewall',
      backend: 'none' as const,
      nativeHelperPresent: false,
      nativeHelperCompatible: false,
      nativeHelperVersion: null,
      requiredHelperVersion: null,
      helperCompatibilityMessage: 'Network isolation is unavailable on non-Windows hosts.',
    };
  }

  const nativeHelperCandidate = resolveNativeHelperCandidate();
  const backend = resolveHelperBackend();
  return {
    providerId: 'windows-firewall',
    backend: backend.kind,
    nativeHelperPresent: Boolean(nativeHelperCandidate),
    nativeHelperCompatible: nativeHelperCandidate?.compatibility === 'compatible',
    nativeHelperVersion: nativeHelperCandidate?.helperVersion ?? null,
    requiredHelperVersion: nativeHelperCandidate?.builtForAppVersion ?? nativeHelperCandidate?.helperVersion ?? null,
    helperCompatibilityMessage: nativeHelperCandidate?.compatibilityMessage ?? 'Native helper executable was not detected.',
  };
}

function toHelperWorkerScript() {
  return [
    "$ErrorActionPreference = 'Stop'",
    '$utf8NoBom = New-Object System.Text.UTF8Encoding($false)',
    "$helperRoot = Split-Path -Parent $MyInvocation.MyCommand.Path",
    "$requestsPath = Join-Path $helperRoot 'requests'",
    "$responsesPath = Join-Path $helperRoot 'responses'",
    'New-Item -ItemType Directory -Force -Path $requestsPath | Out-Null',
    'New-Item -ItemType Directory -Force -Path $responsesPath | Out-Null',
    '$pendingRequests = @(Get-ChildItem -LiteralPath $requestsPath -Filter *.json -File -ErrorAction SilentlyContinue | Sort-Object Name)',
    'foreach ($requestFile in $pendingRequests) {',
    '  $requestId = [System.IO.Path]::GetFileNameWithoutExtension($requestFile.Name)',
    '  $responseFile = Join-Path $responsesPath ($requestId + ".json")',
    '  try {',
    '    $request = Get-Content -LiteralPath $requestFile.FullName -Raw -Encoding UTF8 | ConvertFrom-Json',
    '    if ($request.action -eq "create") {',
    '      Get-NetFirewallRule -Group $request.ruleGroup -ErrorAction SilentlyContinue | Remove-NetFirewallRule | Out-Null',
    '      New-NetFirewallRule -DisplayName ("Local Game Gallery Outbound Block: " + $request.gameName) -Direction Outbound -Action Block -Profile Any -Program $request.executablePath -Group $request.ruleGroup | Out-Null',
    '      New-NetFirewallRule -DisplayName ("Local Game Gallery Inbound Block: " + $request.gameName) -Direction Inbound -Action Block -Profile Any -Program $request.executablePath -Group $request.ruleGroup | Out-Null',
    '    } elseif ($request.action -eq "remove") {',
    '      Get-NetFirewallRule -Group $request.ruleGroup -ErrorAction SilentlyContinue | Remove-NetFirewallRule | Out-Null',
    '    } else {',
    '      throw "Unsupported helper action: $($request.action)"',
    '    }',
    '    $successJson = @{ ok = $true; requestId = $requestId; processedAt = [DateTime]::UtcNow.ToString("o") } | ConvertTo-Json -Depth 5',
    '    [System.IO.File]::WriteAllText($responseFile, $successJson, $utf8NoBom)',
    '  } catch {',
    '    $errorJson = @{ ok = $false; requestId = $requestId; message = $_.Exception.Message; processedAt = [DateTime]::UtcNow.ToString("o") } | ConvertTo-Json -Depth 5',
    '    [System.IO.File]::WriteAllText($responseFile, $errorJson, $utf8NoBom)',
    '  } finally {',
    '    Remove-Item -LiteralPath $requestFile.FullName -Force -ErrorAction SilentlyContinue',
    '  }',
    '}',
  ].join('\n');
}

async function ensureHelperTaskInstalled(backend: HelperBackend) {
  await mkdir(helperRequestsPath, { recursive: true });
  await mkdir(helperResponsesPath, { recursive: true });

  if (backend.kind === 'powershell') {
    await writeFile(backend.workerScriptPath, toHelperWorkerScript(), 'utf8');
  }

  if (!helperInstallPromises.has(backend.taskName)) {
    const installPromise = (async () => {
      const taskArguments = backend.kind === 'native'
        ? ''
        : `-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${backend.workerScriptPath}"`;
      const executePath = backend.kind === 'native' ? backend.executablePath : 'powershell.exe';
      const existingTaskMatchesBackend = await runPowerShellWithOutput([
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        [
          `$taskName = ${toPowerShellSingleQuoted(backend.taskName)}`,
          '$task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop',
          '$action = @($task.Actions | Select-Object -First 1)[0]',
          'if (-not $action) { throw "Scheduled task has no actions." }',
          '@{ execute = [string]$action.Execute; arguments = [string]$action.Arguments } | ConvertTo-Json -Compress',
        ].join('; '),
      ]).then(({ stdout }) => {
        const action = JSON.parse(stdout) as { execute?: string; arguments?: string };
        const executeMatches = normalizeComparablePath(action.execute) === normalizeComparablePath(executePath)
          || normalizeComparableText(path.basename(action.execute ?? '')) === normalizeComparableText(path.basename(executePath));
        const argumentsMatch = normalizeComparableText(action.arguments) === normalizeComparableText(taskArguments);
        return executeMatches && argumentsMatch;
      }).catch(() => false);

      if (existingTaskMatchesBackend) {
        return;
      }

      const scriptContent = [
        '$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name',
        `$taskName = ${toPowerShellSingleQuoted(backend.taskName)}`,
        `$executePath = ${toPowerShellSingleQuoted(executePath)}`,
        `$taskArguments = ${toPowerShellSingleQuoted(taskArguments)}`,
        '$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue',
        'if ($existingTask) {',
        '  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null',
        '}',
        '$actionParameters = @{ Execute = $executePath }',
        'if ($taskArguments) {',
        '  $actionParameters.Argument = $taskArguments',
        '}',
        '$action = New-ScheduledTaskAction @actionParameters',
        '$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Highest',
        '$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable',
        'Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings -Force | Out-Null',
      ].join('\n');

      await runElevatedScript(scriptContent);
    })().catch((error) => {
      helperInstallPromises.delete(backend.taskName);
      throw error;
    });

    helperInstallPromises.set(backend.taskName, installPromise);
  }

  return helperInstallPromises.get(backend.taskName);
}

async function runHelperTask(backend: HelperBackend) {
  await runPowerShellWithOutput([
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `Start-ScheduledTask -TaskName ${toPowerShellSingleQuoted(backend.taskName)} -ErrorAction Stop`,
  ]);
}

async function submitHelperRequest(request: FirewallHelperRequest) {
  const nativeHelperCandidate = resolveNativeHelperCandidate();
  if (nativeHelperCandidate && nativeHelperCandidate.compatibility !== 'compatible') {
    throw new Error(`Native isolation helper is incompatible: ${nativeHelperCandidate.compatibilityMessage}`);
  }

  const backend = resolveHelperBackend();
  await ensureHelperTaskInstalled(backend);

  const requestPath = path.join(helperRequestsPath, `${request.requestId}.json`);
  const responsePath = path.join(helperResponsesPath, `${request.requestId}.json`);
  await unlink(responsePath).catch(() => undefined);
  await writeFile(requestPath, JSON.stringify(request), 'utf8');

  try {
    await runHelperTask(backend);
    await waitForFile(responsePath);
    const rawResponse = await readFile(responsePath, 'utf8');
    const response = JSON.parse(rawResponse.replace(/^\uFEFF/, '')) as FirewallHelperResponse;
    if (!response.ok) {
      throw new Error(response.message || 'Elevated firewall helper request failed.');
    }
  } finally {
    await unlink(requestPath).catch(() => undefined);
    await unlink(responsePath).catch(() => undefined);
  }
}

async function runElevatedScript(scriptContent: string) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'lgg-net-isolation-'));
  const scriptPath = path.join(tempRoot, 'firewall-rule.ps1');
  const errorPath = path.join(tempRoot, 'error.txt');
  const wrappedScriptContent = [
    "$ErrorActionPreference = 'Stop'",
    'try {',
    scriptContent,
    '} catch {',
    `  $_.Exception.ToString() | Set-Content -LiteralPath ${toPowerShellSingleQuoted(errorPath)} -Encoding UTF8`,
    '  exit 1',
    '}',
  ].join('\n');
  await writeFile(scriptPath, wrappedScriptContent, 'utf8');

  const elevatedArguments = `-NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`;

  const launcherScript = [
    "$ErrorActionPreference = 'Stop'",
    `$processHandle = Start-Process -FilePath 'powershell.exe' -Verb RunAs -WindowStyle Hidden -PassThru -Wait -ArgumentList ${toPowerShellSingleQuoted(elevatedArguments)}`,
    'exit $processHandle.ExitCode',
  ].join('; ');

  try {
    await runPowerShell([
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      launcherScript,
    ]);
  } catch (error) {
    const detail = await readFile(errorPath, 'utf8').catch(() => '');
    throw new Error(detail.trim() || (error instanceof Error ? error.message : 'Elevated PowerShell failed.'));
  } finally {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function createLaunchIsolationSession(
  executablePath: string,
  request: LaunchIsolationRequest,
): Promise<LaunchIsolationSession | null> {
  if (!request.enabled) {
    return null;
  }

  if (process.platform !== 'win32') {
    throw new Error('Network isolation for game launches is not supported on this platform yet.');
  }

  const ruleGroup = `LocalGameGallery-${randomUUID()}`;

  try {
    await submitHelperRequest({
      requestId: randomUUID(),
      action: 'create',
      ruleGroup,
      executablePath,
      gameName: request.gameName,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown helper failure.';
    throw new Error(`Failed to enable network isolation for "${request.gameName}": ${detail}`);
  }

  return {
    ruleGroup,
    executablePath,
    gameName: request.gameName,
  };
}

export async function cleanupLaunchIsolationSession(session: LaunchIsolationSession) {
  if (process.platform !== 'win32') {
    return;
  }

  await submitHelperRequest({
    requestId: randomUUID(),
    action: 'remove',
    ruleGroup: session.ruleGroup,
  });
}

export const windowsFirewallIsolationProvider: LaunchIsolationProvider = {
  id: 'windows-firewall',
  isSupported: () => process.platform === 'win32',
  requiresElevation: () => process.platform === 'win32',
  getDiagnostics: getWindowsFirewallIsolationDiagnostics,
  createSession: createLaunchIsolationSession,
  cleanupSession: cleanupLaunchIsolationSession,
};
