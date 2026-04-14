import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const markerPatterns = [
  'dist-electron/electron/service-tray.js',
  'dist-electron/electron/web-client-tray.js',
  'dist-standalone-electron/electron/main.js',
];

function normalizeCommand(value) {
  return String(value ?? '').replace(/\\/g, '/').toLowerCase();
}

function hasBaremetalMarker(commandLine) {
  const normalized = normalizeCommand(commandLine);
  return markerPatterns.some((marker) => normalized.includes(marker));
}

async function listProcesses() {
  if (process.platform === 'win32') {
    const { stdout } = await execFileAsync('wmic', ['process', 'get', 'ProcessId,CommandLine', '/FORMAT:CSV'], {
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });

    const processes = [];
    for (const line of stdout.split(/\r?\n/)) {
      if (!line || line.startsWith('Node,CommandLine,ProcessId')) {
        continue;
      }

      const lastComma = line.lastIndexOf(',');
      if (lastComma <= 0) {
        continue;
      }

      const commandLine = line.slice(line.indexOf(',') + 1, lastComma).trim();
      const rawPid = line.slice(lastComma + 1).trim();
      const pid = Number.parseInt(rawPid, 10);
      if (!Number.isFinite(pid) || pid <= 0) {
        continue;
      }

      processes.push({ pid, commandLine });
    }

    return processes;
  }

  const { stdout } = await execFileAsync('ps', ['-ax', '-o', 'pid=,command='], {
    maxBuffer: 10 * 1024 * 1024,
  });

  const processes = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const firstSpace = trimmed.indexOf(' ');
    if (firstSpace <= 0) {
      continue;
    }

    const pid = Number.parseInt(trimmed.slice(0, firstSpace), 10);
    if (!Number.isFinite(pid) || pid <= 0) {
      continue;
    }

    const commandLine = trimmed.slice(firstSpace + 1);
    processes.push({ pid, commandLine });
  }

  return processes;
}

async function main() {
  const currentPid = process.pid;
  const processes = await listProcesses();

  const targetPids = new Set(
    processes
      .filter((entry) => entry.pid !== currentPid)
      .filter((entry) => hasBaremetalMarker(entry.commandLine))
      .map((entry) => entry.pid),
  );

  if (!targetPids.size) {
    console.log('[down:baremetal] no bare-metal runtime processes found.');
    return;
  }

  let stopped = 0;
  for (const pid of targetPids) {
    try {
      process.kill(pid, 'SIGTERM');
      stopped += 1;
    } catch {
      // Ignore already-exited or inaccessible processes and continue.
    }
  }

  console.log(`[down:baremetal] requested stop for ${stopped} process(es).`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[down:baremetal] failed: ${message}`);
  process.exitCode = 1;
});
