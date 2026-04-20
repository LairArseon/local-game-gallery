import { execFile, spawn } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const netstatBuffer = 12 * 1024 * 1024;
const processListBuffer = 8 * 1024 * 1024;
const isDevMode = process.argv.includes('--dev');
const launcherTag = isDevMode ? 'up:baremetal:dev' : 'up:baremetal';
const stackScriptName = isDevMode ? 'up:baremetal:stack:dev' : 'up:baremetal:stack';

const defaultServicePort = 37995;
const defaultWebPort = 4173;
const repoRoot = process.cwd();
const skipDirectoryNames = new Set([
  '.git',
  'node_modules',
  'dist',
  'dist-electron',
  'dist-web-client',
  'dist-standalone-client',
  'dist-standalone-electron',
  'release',
]);

const buildTargets = [
  {
    label: 'electron runtime',
    command: 'build:electron',
    sourceEntries: [
      'apps/full-desktop/electron',
    ],
    outputEntries: [
      'dist-electron/electron/service-tray.js',
      'dist-electron/electron/web-client-tray.js',
      'dist-electron/electron/service.js',
    ],
  },
  {
    label: 'web client',
    command: 'build:web-client',
    sourceEntries: [
      'apps/web-client/src',
      'apps/shared/app-shell',
      'apps/web-client/vite.config.ts',
    ],
    outputEntries: [
      'dist-web-client/index.html',
    ],
  },
  {
    label: 'standalone client',
    command: 'build:standalone-client',
    sourceEntries: [
      'apps/standalone-client/src',
      'apps/standalone-client/electron',
      'apps/shared/app-shell',
      'apps/standalone-client/vite.config.ts',
      // Standalone renderer imports web-client source directly.
      'apps/web-client/src',
    ],
    outputEntries: [
      'dist-standalone-client/index.html',
      'dist-standalone-electron/electron/main.js',
    ],
  },
];

const requiredPorts = Array.from(new Set([
  normalizePort(process.env.LGG_SERVICE_PORT, defaultServicePort),
  normalizePort(process.env.LGG_WEB_PORT, defaultWebPort),
])).sort((left, right) => left - right);

const newestMtimeCache = new Map();

function normalizePort(rawValue, fallbackPort) {
  const parsed = Number.parseInt(String(rawValue ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    return fallbackPort;
  }

  return parsed;
}

function parsePortFromEndpoint(endpoint) {
  const text = String(endpoint ?? '').trim();
  if (!text) {
    return null;
  }

  const lastColon = text.lastIndexOf(':');
  if (lastColon < 0 || lastColon + 1 >= text.length) {
    return null;
  }

  const parsed = Number.parseInt(text.slice(lastColon + 1), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    return null;
  }

  return parsed;
}

function parseTasklistCsvImageName(line) {
  const text = String(line ?? '').trim();
  if (!text || text.startsWith('INFO:')) {
    return null;
  }

  const match = text.match(/^"([^"]+)"/);
  if (!match?.[1]) {
    return null;
  }

  return match[1];
}

function resolveRepoPath(entry) {
  return path.resolve(repoRoot, entry);
}

async function getStatSafe(absolutePath) {
  try {
    return await stat(absolutePath);
  } catch {
    return null;
  }
}

async function collectNewestMtimeFromPath(absolutePath) {
  const candidate = await getStatSafe(absolutePath);
  if (!candidate) {
    return 0;
  }

  if (candidate.isFile()) {
    return candidate.mtimeMs;
  }

  if (!candidate.isDirectory()) {
    return 0;
  }

  let newest = 0;
  const entries = await readdir(absolutePath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && skipDirectoryNames.has(entry.name)) {
      continue;
    }

    const childPath = path.join(absolutePath, entry.name);
    const childNewest = await collectNewestMtimeFromPath(childPath);
    if (childNewest > newest) {
      newest = childNewest;
    }
  }

  return newest;
}

async function getNewestMtime(entry) {
  if (newestMtimeCache.has(entry)) {
    return newestMtimeCache.get(entry) ?? 0;
  }

  const newest = await collectNewestMtimeFromPath(resolveRepoPath(entry));
  newestMtimeCache.set(entry, newest);
  return newest;
}

async function evaluateBuildTarget(target) {
  let newestSourceMtime = 0;
  for (const sourceEntry of target.sourceEntries) {
    const mtime = await getNewestMtime(sourceEntry);
    if (mtime > newestSourceMtime) {
      newestSourceMtime = mtime;
    }
  }

  let oldestOutputMtime = Number.POSITIVE_INFINITY;
  const missingOutputs = [];

  for (const outputEntry of target.outputEntries) {
    const outputStat = await getStatSafe(resolveRepoPath(outputEntry));
    if (!outputStat || !outputStat.isFile()) {
      missingOutputs.push(outputEntry);
      oldestOutputMtime = 0;
      continue;
    }

    if (outputStat.mtimeMs < oldestOutputMtime) {
      oldestOutputMtime = outputStat.mtimeMs;
    }
  }

  const hasMissingOutputs = missingOutputs.length > 0;
  const isStale = hasMissingOutputs || oldestOutputMtime < newestSourceMtime;

  return {
    ...target,
    isStale,
    hasMissingOutputs,
    missingOutputs,
    newestSourceMtime,
    oldestOutputMtime: Number.isFinite(oldestOutputMtime) ? oldestOutputMtime : 0,
  };
}

async function collectStaleBuildTargets() {
  const results = [];
  for (const target of buildTargets) {
    const result = await evaluateBuildTarget(target);
    if (result.isStale) {
      results.push(result);
    }
  }

  return results;
}

function printStaleBuildTargets(targets) {
  console.log(`[${launcherTag}] detected stale or missing build artifacts:`);
  for (const target of targets) {
    if (target.hasMissingOutputs) {
      console.log(`  - ${target.label}: missing ${target.missingOutputs.join(', ')}`);
      continue;
    }

    console.log(`  - ${target.label}: output is older than source changes.`);
  }
}

async function runNpmScript(scriptName) {
  await new Promise((resolve, reject) => {
    const child = process.platform === 'win32'
      ? spawn('cmd.exe', ['/d', '/s', '/c', `npm run ${scriptName}`], { stdio: 'inherit' })
      : spawn('npm', ['run', scriptName], { stdio: 'inherit' });

    child.on('error', (error) => {
      const message = error instanceof Error ? error.message : String(error);
      reject(new Error(`failed to launch npm run ${scriptName}: ${message}`));
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`npm run ${scriptName} exited with code ${code ?? 1}`));
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getListeningPidsForPortWindows(port) {
  const { stdout } = await execFileAsync('netstat', ['-ano', '-p', 'tcp'], {
    windowsHide: true,
    maxBuffer: netstatBuffer,
  });

  const pids = new Set();
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || !line.startsWith('TCP')) {
      continue;
    }

    const columns = line.split(/\s+/);
    if (columns.length < 5) {
      continue;
    }

    const localEndpoint = columns[1] ?? '';
    const state = columns[3] ?? '';
    const rawPid = columns[4] ?? '';

    if (state.toUpperCase() !== 'LISTENING') {
      continue;
    }

    const localPort = parsePortFromEndpoint(localEndpoint);
    if (localPort !== port) {
      continue;
    }

    const pid = Number.parseInt(rawPid, 10);
    if (Number.isFinite(pid) && pid > 0) {
      pids.add(pid);
    }
  }

  return [...pids];
}

async function getListeningPidsForPortPosix(port) {
  try {
    const { stdout } = await execFileAsync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
      maxBuffer: processListBuffer,
    });

    const pids = new Set();
    for (const rawLine of stdout.split(/\r?\n/)) {
      const pid = Number.parseInt(rawLine.trim(), 10);
      if (Number.isFinite(pid) && pid > 0) {
        pids.add(pid);
      }
    }

    return [...pids];
  } catch (error) {
    const errorCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (errorCode === '1') {
      return [];
    }

    throw error;
  }
}

async function getListeningPidsForPort(port) {
  if (process.platform === 'win32') {
    return getListeningPidsForPortWindows(port);
  }

  return getListeningPidsForPortPosix(port);
}

async function resolveProcessName(pid) {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
        windowsHide: true,
        maxBuffer: processListBuffer,
      });

      const firstLine = stdout.split(/\r?\n/).find((entry) => entry.trim());
      const imageName = parseTasklistCsvImageName(firstLine ?? '');
      return imageName || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  try {
    const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'comm='], {
      maxBuffer: processListBuffer,
    });

    const command = stdout.trim();
    return command || 'unknown';
  } catch {
    return 'unknown';
  }
}

async function collectBlockers(ports) {
  const pidToPorts = new Map();

  for (const port of ports) {
    const listeningPids = await getListeningPidsForPort(port);
    for (const pid of listeningPids) {
      if (!pidToPorts.has(pid)) {
        pidToPorts.set(pid, new Set());
      }

      pidToPorts.get(pid).add(port);
    }
  }

  const blockers = [];
  for (const [pid, blockedPorts] of pidToPorts.entries()) {
    const name = await resolveProcessName(pid);
    blockers.push({
      pid,
      name,
      ports: [...blockedPorts].sort((left, right) => left - right),
    });
  }

  blockers.sort((left, right) => {
    const leftPort = left.ports[0] ?? 0;
    const rightPort = right.ports[0] ?? 0;
    if (leftPort !== rightPort) {
      return leftPort - rightPort;
    }

    return left.pid - right.pid;
  });

  return blockers;
}

function printBlockers(blockers) {
  const blockedPortSet = new Set();
  for (const blocker of blockers) {
    for (const port of blocker.ports) {
      blockedPortSet.add(port);
    }
  }

  const blockedPorts = [...blockedPortSet].sort((left, right) => left - right);
  console.error(`[${launcherTag}] required ports are currently in use: ${blockedPorts.join(', ')}`);

  for (const blocker of blockers) {
    const plural = blocker.ports.length > 1 ? 'ports' : 'port';
    console.error(`  - PID ${blocker.pid} (${blocker.name}) on ${plural} ${blocker.ports.join(', ')}`);
  }
}

async function askForConfirmation() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(`[${launcherTag}] interactive confirmation is not available in this terminal.`);
    return false;
  }

  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await prompt.question(`[${launcherTag}] kill blocking process(es) and continue? [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    prompt.close();
  }
}

async function askYesNo(question, { defaultYes }) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const fallback = defaultYes ? 'yes' : 'no';
    console.log(`[${launcherTag}] no interactive TTY available; defaulting to ${fallback}.`);
    return defaultYes;
  }

  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await prompt.question(question);
    const normalized = answer.trim().toLowerCase();
    if (!normalized) {
      return defaultYes;
    }

    if (normalized === 'y' || normalized === 'yes') {
      return true;
    }

    if (normalized === 'n' || normalized === 'no') {
      return false;
    }

    return defaultYes;
  } finally {
    prompt.close();
  }
}

async function terminateProcess(pid) {
  if (process.platform === 'win32') {
    try {
      await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
        maxBuffer: processListBuffer,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`taskkill failed for PID ${pid}: ${message}`);
    }

    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to send SIGTERM to PID ${pid}: ${message}`);
  }
}

async function waitForPortsToBeFree(ports, timeoutMs = 6000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const blockers = await collectBlockers(ports);
    if (!blockers.length) {
      return true;
    }

    await delay(250);
  }

  return false;
}

function runBaremetalStack() {
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', `npm run ${stackScriptName}`], { stdio: 'inherit' })
    : spawn('npm', ['run', stackScriptName], { stdio: 'inherit' });

  child.on('error', (error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${launcherTag}] failed to launch stack: ${message}`);
    process.exitCode = 1;
  });

  child.on('exit', (code) => {
    process.exit(code ?? 1);
  });
}

async function main() {
  const staleTargets = await collectStaleBuildTargets();
  if (staleTargets.length) {
    printStaleBuildTargets(staleTargets);

    const shouldBuild = await askYesNo(`[${launcherTag}] rebuild these artifacts before startup? [Y/n] `, {
      defaultYes: true,
    });

    if (shouldBuild) {
      const commands = [...new Set(staleTargets.map((target) => target.command))];
      for (const command of commands) {
        console.log(`[${launcherTag}] running npm run ${command}...`);
        await runNpmScript(command);
      }
    } else {
      console.warn(`[${launcherTag}] continuing without rebuild; runtime may use stale UI/code artifacts.`);
    }
  }

  const blockers = await collectBlockers(requiredPorts);

  if (blockers.length) {
    printBlockers(blockers);
    const confirmed = await askForConfirmation();

    if (!confirmed) {
      console.error(`[${launcherTag}] cancelled. No blocking processes were terminated.`);
      process.exitCode = 1;
      return;
    }

    for (const blocker of blockers) {
      console.log(`[${launcherTag}] stopping PID ${blocker.pid} (${blocker.name})...`);
      await terminateProcess(blocker.pid);
    }

    const isFree = await waitForPortsToBeFree(requiredPorts);
    if (!isFree) {
      const remaining = await collectBlockers(requiredPorts);
      if (remaining.length) {
        printBlockers(remaining);
      }
      console.error(`[${launcherTag}] ports are still blocked after termination attempt.`);
      process.exitCode = 1;
      return;
    }

    console.log(`[${launcherTag}] required ports are now free.`);
  }

  runBaremetalStack();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${launcherTag}] failed: ${message}`);
  process.exitCode = 1;
});
