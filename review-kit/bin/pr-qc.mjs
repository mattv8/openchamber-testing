#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const __filename = fileURLToPath(import.meta.url);

async function main() {
  const [command, manifestPath, flag] = process.argv.slice(2);
  if (!command || !manifestPath) {
    fail('Usage: node pr-qc.mjs inspect|start-web|start-electron|status|stop <manifest> [--approved]');
  }

  const manifest = loadManifest(manifestPath);
  const context = {
    manifest,
    manifestPath: path.resolve(manifestPath),
    stateDir: path.resolve(process.env.OPENCHAMBER_REVIEW_STATE_DIR || path.dirname(manifestPath)),
  };

  switch (command) {
    case 'inspect': {
      verifyHead(context.manifest);
      const changedPaths = getChangedPaths(context.manifest);
      const trustBoundaryPaths = changedPaths
        .map((changedPath) => ({ path: changedPath, reasons: classifyTrustBoundaryPath(changedPath) }))
        .filter((entry) => entry.reasons.length > 0);
      printJson({
        prNumber: context.manifest.prNumber,
        headSha: context.manifest.headSha,
        worktreePath: context.manifest.worktreePath,
        changedPaths,
        trustBoundaryPaths,
      });
      return;
    }
    case 'start-web': {
      requireApproved(flag);
      verifyHead(context.manifest);
      const uiPort = await findAvailableLoopbackPort();
      const apiPort = await findAvailableLoopbackPort(new Set([uiPort]));
      const state = startQcProcess(context, {
        mode: 'web',
        args: ['run', 'dev:web:hmr'],
        env: {
          OPENCHAMBER_HMR_HOST: '127.0.0.1',
          OPENCHAMBER_HMR_UI_PORT: String(uiPort),
          OPENCHAMBER_HMR_API_PORT: String(apiPort),
        },
        uiPort,
        apiPort,
      });
      printJson({
        status: 'started',
        mode: state.mode,
        pid: state.pid,
        url: `http://127.0.0.1:${state.uiPort}`,
        stopCommand: `node ${quoteForShell(__filename)} stop ${quoteForShell(context.manifestPath)}`,
      });
      return;
    }
    case 'start-electron': {
      requireApproved(flag);
      verifyHead(context.manifest);
      const state = startQcProcess(context, {
        mode: 'electron',
        args: ['run', 'electron:dev:bundled'],
        env: {},
        uiPort: null,
        apiPort: null,
      });
      printJson({
        status: 'started',
        mode: state.mode,
        pid: state.pid,
        stopCommand: `node ${quoteForShell(__filename)} stop ${quoteForShell(context.manifestPath)}`,
      });
      return;
    }
    case 'status': {
      const state = readState(context);
      if (!state) {
        printJson({ status: 'stopped' });
        return;
      }
      const status = getRecordedProcessStatus(state);
      if (status.kind === 'live') {
        printJson({ status: 'live', ...state });
        return;
      }
      printJson({ status: 'stale', staleReason: status.reason, ...state });
      return;
    }
    case 'stop': {
      const state = readState(context);
      if (!state) {
        printJson({ status: 'stopped' });
        return;
      }
      const status = getRecordedProcessStatus(state);
      if (status.kind === 'identity-mismatch') {
        fail(`Refusing to signal ${state.pid} from ${getStatePath(context)} because the recorded process identity mismatch suggests PID reuse. Inspect the file or remove it manually after checking the process.`);
      }
      if (status.kind === 'live') {
        await stopProcessGroup(state.pid);
      }
      rmSync(getStatePath(context), { force: true });
      printJson({ status: 'stopped', mode: state.mode, pid: state.pid });
      return;
    }
    default:
      fail(`Unknown command: ${command}`);
  }
}

function requireApproved(flag) {
  if (flag !== '--approved') {
    fail('Refusing to launch QC process without --approved.');
  }
}

function loadManifest(manifestPath) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail(`Failed to read manifest: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!Number.isInteger(manifest.prNumber) || manifest.prNumber <= 0) {
    fail('Manifest prNumber must be a positive integer.');
  }
  if (typeof manifest.headSha !== 'string' || manifest.headSha.trim() === '') {
    fail('Manifest headSha must be a non-empty string.');
  }
  if (typeof manifest.worktreePath !== 'string' || manifest.worktreePath.trim() === '') {
    fail('Manifest worktreePath must be a non-empty string.');
  }

  return {
    ...manifest,
    headSha: manifest.headSha.trim(),
    worktreePath: path.resolve(manifest.worktreePath),
  };
}

function verifyHead(manifest) {
  const currentHead = runCommand('git', ['-C', manifest.worktreePath, 'rev-parse', 'HEAD']).stdout.trim();
  if (currentHead !== manifest.headSha) {
    fail(`Manifest HEAD mismatch: expected ${manifest.headSha}, got ${currentHead}.`);
  }
}

function getChangedPaths(manifest) {
  const stdout = runCommand('git', ['-C', manifest.worktreePath, 'diff', '--name-only', 'upstream/main...HEAD']).stdout;
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((changedPath) => validateChangedPath(manifest.worktreePath, changedPath));
}

function validateChangedPath(worktreePath, changedPath) {
  if (path.isAbsolute(changedPath)) {
    fail(`Changed path ${changedPath} is outside the manifest worktree.`);
  }
  const resolvedPath = path.resolve(worktreePath, changedPath);
  const rootPath = path.resolve(worktreePath);
  if (resolvedPath !== rootPath && !resolvedPath.startsWith(`${rootPath}${path.sep}`)) {
    fail(`Changed path ${changedPath} is outside the manifest worktree.`);
  }
  return changedPath;
}

function classifyTrustBoundaryPath(changedPath) {
  const reasons = [];
  if (/(^|\/)(package\.json|package-lock\.json|bun\.lockb?|pnpm-lock\.yaml|yarn\.lock)$/.test(changedPath)) {
    reasons.push('dependency-manifest-or-lockfile');
  }
  if (/^\.github\/workflows\//.test(changedPath)) {
    reasons.push('workflow');
  }
  if (/^(scripts\/|packages\/[^/]+\/scripts\/)/.test(changedPath)) {
    reasons.push('lifecycle-or-build-script');
  }
  if (/^packages\/electron\//.test(changedPath)) {
    reasons.push('electron-privileged-file');
  }
  if (/(^|\/)(patches\/.*|.*\.patch)$/.test(changedPath)) {
    reasons.push('dependency-patch');
  }
  if (/(^|\/)(shell|fs|filesystem|auth|network|relay|socket|websocket|sse|ipc|tunnel|proxy)([._/-]|$)/.test(changedPath)) {
    reasons.push('shell-filesystem-auth-network-module');
  }
  return reasons;
}

function startQcProcess(context, config) {
  ensureInstall(context.manifest.worktreePath);
  const existingState = readState(context);
  if (existingState && getRecordedProcessStatus(existingState).kind === 'live') {
    fail(`QC process already running for PR ${context.manifest.prNumber}.`);
  }

  mkdirSync(context.stateDir, { recursive: true });
  const logDir = path.join(context.stateDir, 'logs');
  mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `pr-${context.manifest.prNumber}.${config.mode}.log`);
  const logFd = openSync(logPath, 'a');

  const child = spawn('bun', config.args, {
    cwd: context.manifest.worktreePath,
    env: { ...process.env, ...config.env },
    detached: process.platform !== 'win32',
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();

  const processStartToken = getProcessStartToken(child.pid);
  if (!processStartToken) {
    stopProcessGroupSyncBestEffort(child.pid);
    fail(`Failed to capture process identity for PID ${child.pid}; no QC state was written.`);
  }

  const state = {
    mode: config.mode,
    pid: child.pid,
    processStartToken,
    startedAt: new Date().toISOString(),
    uiPort: config.uiPort,
    apiPort: config.apiPort,
    logPath,
    worktreePath: context.manifest.worktreePath,
  };
  writeState(context, state);
  return state;
}

function ensureInstall(worktreePath) {
  if (existsSync(path.join(worktreePath, 'node_modules'))) {
    return;
  }
  runCommand('bun', ['install', '--frozen-lockfile'], { cwd: worktreePath });
}

function readState(context) {
  const statePath = getStatePath(context);
  if (!existsSync(statePath)) {
    return null;
  }
  let state;
  try {
    state = JSON.parse(readFileSync(statePath, 'utf8'));
  } catch (error) {
    failInvalidState(statePath, error instanceof Error ? error.message : String(error));
  }

  validateStateShape(statePath, state);
  return state;
}

function writeState(context, state) {
  const statePath = getStatePath(context);
  mkdirSync(path.dirname(statePath), { recursive: true });
  const tempPath = `${statePath}.tmp-${process.pid}`;
  writeFileSync(tempPath, JSON.stringify(state, null, 2));
  renameSync(tempPath, statePath);
}

function getStatePath(context) {
  return path.join(context.stateDir, `pr-${context.manifest.prNumber}.qc.json`);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
  });
  if (result.error) {
    fail(`${command} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} failed: ${(result.stderr || '').trim()}`.trim());
  }
  return result;
}

function getProcessStartToken(pid) {
  const result = spawnSync('ps', ['-o', 'lstart=', '-o', 'pgid=', '-p', String(pid)], {
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) {
    return null;
  }
  const lines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return null;
  }
  return lines.map((line) => line.replace(/\s+/g, ' ').trim()).join(' | ');
}

async function findAvailableLoopbackPort(excludedPorts = new Set()) {
  while (true) {
    const port = await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once('error', reject);
      server.once('listening', () => {
        const address = server.address();
        const value = typeof address === 'object' && address ? address.port : 0;
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(value);
        });
      });
      server.listen(0, '127.0.0.1');
    });
    if (!excludedPorts.has(port)) {
      return port;
    }
  }
}

async function stopProcessGroup(pid) {
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGKILL']) {
    signalProcessGroup(pid, signal);
    await waitForExit(pid, signal === 'SIGKILL' ? 1000 : 2500);
    if (!isProcessAlive(pid)) {
      return;
    }
  }
}

function signalProcessGroup(pid, signal) {
  try {
    if (process.platform !== 'win32') {
      process.kill(-pid, signal);
      return;
    }
  } catch {
  }

  try {
    process.kill(pid, signal);
  } catch {
  }
}

function signalProcessGroupSync(pid, signal) {
  try {
    if (process.platform !== 'win32') {
      process.kill(-pid, signal);
      return;
    }
  } catch {
  }

  try {
    process.kill(pid, signal);
  } catch {
  }
}

function stopProcessGroupSyncBestEffort(pid) {
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGKILL']) {
    signalProcessGroupSync(pid, signal);
    if (!isProcessAlive(pid)) {
      return;
    }
  }
}

async function waitForExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return;
    }
    await delay(50);
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getRecordedProcessStatus(state) {
  if (!isProcessAlive(state.pid)) {
    return { kind: 'stale', reason: 'pid-not-running' };
  }
  const currentToken = getProcessStartToken(state.pid);
  if (!currentToken) {
    return { kind: 'stale', reason: 'identity-query-failed' };
  }
  if (currentToken !== state.processStartToken) {
    return { kind: 'identity-mismatch', reason: 'identity-mismatch' };
  }
  return { kind: 'live' };
}

function validateStateShape(statePath, state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    failInvalidState(statePath, 'state must be a JSON object');
  }
  if (state.mode !== 'web' && state.mode !== 'electron') {
    failInvalidState(statePath, 'mode must be "web" or "electron"');
  }
  if (!Number.isInteger(state.pid) || state.pid <= 0) {
    failInvalidState(statePath, 'pid must be a positive integer');
  }
  if (typeof state.processStartToken !== 'string' || state.processStartToken.trim() === '') {
    failInvalidState(statePath, 'processStartToken must be a non-empty string');
  }
  if (typeof state.startedAt !== 'string' || state.startedAt.trim() === '') {
    failInvalidState(statePath, 'startedAt must be a non-empty string');
  }
  if (!isOptionalInteger(state.uiPort)) {
    failInvalidState(statePath, 'uiPort must be an integer or null');
  }
  if (!isOptionalInteger(state.apiPort)) {
    failInvalidState(statePath, 'apiPort must be an integer or null');
  }
  if (typeof state.logPath !== 'string' || state.logPath.trim() === '') {
    failInvalidState(statePath, 'logPath must be a non-empty string');
  }
  if (typeof state.worktreePath !== 'string' || state.worktreePath.trim() === '') {
    failInvalidState(statePath, 'worktreePath must be a non-empty string');
  }
}

function isOptionalInteger(value) {
  return value === null || Number.isInteger(value);
}

function failInvalidState(statePath, reason) {
  fail(`Invalid QC state at ${statePath}: ${reason}. Inspect the file or remove it manually after confirming no QC process still needs it.`);
}

function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function quoteForShell(value) {
  return JSON.stringify(String(value));
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
