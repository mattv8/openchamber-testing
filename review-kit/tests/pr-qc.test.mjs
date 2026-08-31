import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

const helperPath = path.resolve('/Users/elfy/GitRepos/openchamber-testing/review-kit/bin/pr-qc.mjs');

function makeSandbox() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pr-qc-'));
  const binDir = path.join(root, 'bin');
  const repoDir = path.join(root, 'worktree');
  const stateDir = path.join(root, 'state');
  mkdirSync(binDir, { recursive: true });
  mkdirSync(repoDir, { recursive: true });
  mkdirSync(stateDir, { recursive: true });

  const gitStatePath = path.join(root, 'git-state.json');
  const gitLogPath = path.join(root, 'git-log.jsonl');
  const bunLogPath = path.join(root, 'bun-log.jsonl');
  const childInfoDir = path.join(root, 'child-info');
  mkdirSync(childInfoDir, { recursive: true });

  writeFileSync(gitStatePath, JSON.stringify({ head: 'abc123', diffPaths: [] }, null, 2));

  writeExecutable(
    path.join(binDir, 'git'),
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(process.env.FAKE_GIT_STATE_PATH, 'utf8'));
fs.appendFileSync(process.env.FAKE_GIT_LOG_PATH, JSON.stringify({ args }) + '\\n');
let commandArgs = args;
if (args[0] === '-C') {
  commandArgs = args.slice(2);
}
if (commandArgs[0] === 'rev-parse' && commandArgs[1] === 'HEAD') {
  process.stdout.write(String(state.head || '') + '\\n');
  process.exit(0);
}
if (commandArgs[0] === 'diff' && commandArgs[1] === '--name-only') {
  process.stdout.write((state.diffPaths || []).join('\\n'));
  if ((state.diffPaths || []).length > 0) {
    process.stdout.write('\\n');
  }
  process.exit(0);
}
process.stderr.write('unsupported git call: ' + commandArgs.join(' ') + '\\n');
process.exit(1);
`,
  );

  writeExecutable(
    path.join(binDir, 'bun'),
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const args = process.argv.slice(2);
const logPath = process.env.FAKE_BUN_LOG_PATH;
const entry = {
  args,
  cwd: process.cwd(),
  env: {
    OPENCHAMBER_HMR_HOST: process.env.OPENCHAMBER_HMR_HOST || null,
    OPENCHAMBER_HMR_UI_PORT: process.env.OPENCHAMBER_HMR_UI_PORT || null,
    OPENCHAMBER_HMR_API_PORT: process.env.OPENCHAMBER_HMR_API_PORT || null,
  },
};
fs.appendFileSync(logPath, JSON.stringify(entry) + '\\n');
if (args[0] === 'install') {
  process.exit(0);
}
if (args[0] === 'run' && (args[1] === 'dev:web:hmr' || args[1] === 'electron:dev:bundled')) {
  const childInfoPath = path.join(process.env.FAKE_CHILD_INFO_DIR, args[1].replace(/[^a-z0-9]+/gi, '-') + '.json');
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
  });
  fs.writeFileSync(childInfoPath, JSON.stringify({ parentPid: process.pid, childPid: child.pid, args }, null, 2));
  const shutdown = () => {
    try { child.kill('SIGTERM'); } catch {}
    setTimeout(() => process.exit(0), 25);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown);
  setInterval(() => {}, 1000);
  return;
}
process.stderr.write('unsupported bun call: ' + args.join(' ') + '\\n');
process.exit(1);
`,
  );

  return {
    root,
    binDir,
    repoDir,
    stateDir,
    gitStatePath,
    gitLogPath,
    bunLogPath,
    childInfoDir,
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      OPENCHAMBER_REVIEW_STATE_DIR: stateDir,
      FAKE_GIT_STATE_PATH: gitStatePath,
      FAKE_GIT_LOG_PATH: gitLogPath,
      FAKE_BUN_LOG_PATH: bunLogPath,
      FAKE_CHILD_INFO_DIR: childInfoDir,
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function writeExecutable(filePath, content) {
  writeFileSync(filePath, content, { mode: 0o755 });
}

function writeManifest(sandbox, overrides = {}) {
  const manifestPath = path.join(sandbox.stateDir, `pr-${overrides.prNumber || 3178}.json`);
  const manifest = {
    prNumber: 3178,
    title: 'QC target',
    url: 'https://example.test/pr/3178',
    headSha: 'abc123',
    worktreePath: sandbox.repoDir,
    slug: 'qc-target',
    createdAt: '2026-08-28T00:00:00.000Z',
    ...overrides,
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return { manifestPath, manifest };
}

function setGitState(sandbox, state) {
  writeFileSync(sandbox.gitStatePath, JSON.stringify(state, null, 2));
}

function runHelper(args, sandbox) {
  return spawnSync(process.execPath, [helperPath, ...args], {
    encoding: 'utf8',
    env: sandbox.env,
  });
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function readJsonLines(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }
  return readFileSync(filePath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(predicate, message) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(message);
}

function killTree(pid) {
  if (!pid) return;
  try {
    process.kill(-pid, 'SIGKILL');
    return;
  } catch {}
  try {
    process.kill(pid, 'SIGKILL');
  } catch {}
}

async function ensureStopped(manifestPath, sandbox) {
  const result = runHelper(['stop', manifestPath], sandbox);
  if (result.status === 0) {
    return;
  }

  const statePath = path.join(sandbox.stateDir, 'pr-3178.qc.json');
  if (existsSync(statePath)) {
    const state = readJson(statePath);
    killTree(state.pid);
    rmSync(statePath, { force: true });
  }
}

test('inspect lists changed trust-boundary paths', async () => {
  const sandbox = makeSandbox();
  try {
    const { manifestPath } = writeManifest(sandbox);
    setGitState(sandbox, {
      head: 'abc123',
      diffPaths: ['package.json', 'src/app.ts', 'packages/electron/main.mjs', 'patches/fix.patch'],
    });

    const result = runHelper(['inspect', manifestPath], sandbox);

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.deepEqual(payload.changedPaths, ['package.json', 'src/app.ts', 'packages/electron/main.mjs', 'patches/fix.patch']);
    assert.deepEqual(
      payload.trustBoundaryPaths.map((entry) => entry.path),
      ['package.json', 'packages/electron/main.mjs', 'patches/fix.patch'],
    );
  } finally {
    sandbox.cleanup();
  }
});

test('start-web rejects missing --approved', async () => {
  const sandbox = makeSandbox();
  try {
    const { manifestPath } = writeManifest(sandbox);
    const result = runHelper(['start-web', manifestPath], sandbox);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /--approved/);
  } finally {
    sandbox.cleanup();
  }
});

test('start-web rejects manifest and HEAD mismatch', async () => {
  const sandbox = makeSandbox();
  try {
    const { manifestPath } = writeManifest(sandbox, { headSha: 'expected-head' });
    setGitState(sandbox, { head: 'actual-head', diffPaths: [] });
    const result = runHelper(['start-web', manifestPath, '--approved'], sandbox);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /HEAD/i);
  } finally {
    sandbox.cleanup();
  }
});

test('start-web chooses unused loopback ports and records state', async () => {
  const sandbox = makeSandbox();
  try {
    const { manifestPath } = writeManifest(sandbox);
    const result = runHelper(['start-web', manifestPath, '--approved'], sandbox);

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.match(payload.url, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.match(payload.stopCommand, / stop /);

    const state = readJson(path.join(sandbox.stateDir, 'pr-3178.qc.json'));
    assert.equal(state.mode, 'web');
    assert.equal(state.worktreePath, sandbox.repoDir);
    assert.ok(Number.isInteger(state.pid) && state.pid > 0);
    assert.ok(Number.isInteger(state.uiPort) && state.uiPort > 0);
    assert.ok(Number.isInteger(state.apiPort) && state.apiPort > 0);
    assert.notEqual(state.uiPort, state.apiPort);

    await waitFor(() => readJsonLines(sandbox.bunLogPath).length >= 2, 'expected bun calls to be recorded');
    const bunCalls = readJsonLines(sandbox.bunLogPath);
    assert.equal(bunCalls[0].args.join(' '), 'install --frozen-lockfile');
    assert.equal(bunCalls[1].args.join(' '), 'run dev:web:hmr');
    assert.equal(bunCalls[1].env.OPENCHAMBER_HMR_HOST, '127.0.0.1');
    assert.equal(String(state.uiPort), bunCalls[1].env.OPENCHAMBER_HMR_UI_PORT);
    assert.equal(String(state.apiPort), bunCalls[1].env.OPENCHAMBER_HMR_API_PORT);

    await ensureStopped(manifestPath, sandbox);
  } finally {
    sandbox.cleanup();
  }
});

test('status distinguishes live and stale pid', async () => {
  const sandbox = makeSandbox();
  try {
    const { manifestPath } = writeManifest(sandbox);
    const startResult = runHelper(['start-web', manifestPath, '--approved'], sandbox);
    assert.equal(startResult.status, 0, startResult.stderr);

    const liveResult = runHelper(['status', manifestPath], sandbox);
    assert.equal(liveResult.status, 0, liveResult.stderr);
    assert.equal(JSON.parse(liveResult.stdout).status, 'live');

    const state = readJson(path.join(sandbox.stateDir, 'pr-3178.qc.json'));
    killTree(state.pid);
    await waitFor(() => !isAlive(state.pid), 'expected started process to exit');

    const staleResult = runHelper(['status', manifestPath], sandbox);
    assert.equal(staleResult.status, 0, staleResult.stderr);
    assert.equal(JSON.parse(staleResult.stdout).status, 'stale');
  } finally {
    sandbox.cleanup();
  }
});

test('status and stop fail with an actionable error for malformed QC state', async () => {
  const sandbox = makeSandbox();
  try {
    const { manifestPath } = writeManifest(sandbox);
    const statePath = path.join(sandbox.stateDir, 'pr-3178.qc.json');
    writeFileSync(statePath, '{"mode":"web","pid":123');

    const statusResult = runHelper(['status', manifestPath], sandbox);
    assert.notEqual(statusResult.status, 0);
    assert.match(statusResult.stderr, new RegExp(statePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(statusResult.stderr, /Inspect the file or remove it manually/i);

    const stopResult = runHelper(['stop', manifestPath], sandbox);
    assert.notEqual(stopResult.status, 0);
    assert.match(stopResult.stderr, new RegExp(statePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(stopResult.stderr, /Inspect the file or remove it manually/i);
    assert.equal(existsSync(statePath), true);
  } finally {
    sandbox.cleanup();
  }
});

test('stop signals only the recorded process group and clears live state', async () => {
  const sandbox = makeSandbox();
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    detached: true,
    stdio: 'ignore',
  });
  unrelated.unref();

  try {
    const { manifestPath } = writeManifest(sandbox);
    const startResult = runHelper(['start-web', manifestPath, '--approved'], sandbox);
    assert.equal(startResult.status, 0, startResult.stderr);

    const statePath = path.join(sandbox.stateDir, 'pr-3178.qc.json');
    const state = readJson(statePath);
    const childInfoPath = path.join(sandbox.childInfoDir, 'dev-web-hmr.json');
    await waitFor(() => existsSync(childInfoPath), 'expected child info to be recorded');
    const childInfo = readJson(childInfoPath);

    const stopResult = runHelper(['stop', manifestPath], sandbox);
    assert.equal(stopResult.status, 0, stopResult.stderr);
    assert.equal(existsSync(statePath), false);
    await waitFor(() => !isAlive(state.pid), 'expected parent process to stop');
    await waitFor(() => !isAlive(childInfo.childPid), 'expected child process to stop');
    assert.equal(isAlive(unrelated.pid), true);
  } finally {
    killTree(unrelated.pid);
    sandbox.cleanup();
  }
});

test('stop preserves identity across an exec command-name change', async () => {
  const sandbox = makeSandbox();
  let manifestPath;
  let startedPid = null;
  const statePath = path.join(sandbox.stateDir, 'pr-3178.qc.json');

  try {
    const originalFakeBunPath = path.join(sandbox.binDir, 'bun-node');
    rmSync(originalFakeBunPath, { force: true });
    writeExecutable(originalFakeBunPath, readFileSync(path.join(sandbox.binDir, 'bun'), 'utf8'));
    writeExecutable(
      path.join(sandbox.binDir, 'bun'),
      `#!/bin/sh
if [ "$1" = "run" ] && [ "$2" = "dev:web:hmr" ]; then
  sleep 0.3
fi
exec "$(dirname "$0")/bun-node" "$@"
`,
    );

    ({ manifestPath } = writeManifest(sandbox));
    const startResult = runHelper(['start-web', manifestPath, '--approved'], sandbox);
    assert.equal(startResult.status, 0, startResult.stderr);

    const state = readJson(statePath);
    startedPid = state.pid;
    const childInfoPath = path.join(sandbox.childInfoDir, 'dev-web-hmr.json');
    await waitFor(() => existsSync(childInfoPath), 'expected child info to be recorded after bun exec');
    const childInfo = readJson(childInfoPath);

    const stopResult = runHelper(['stop', manifestPath], sandbox);
    assert.equal(stopResult.status, 0, stopResult.stderr);
    assert.equal(existsSync(statePath), false);
    await waitFor(() => !isAlive(state.pid), 'expected wrapped bun parent process to stop');
    await waitFor(() => !isAlive(childInfo.childPid), 'expected wrapped bun child process to stop');
  } finally {
    if (existsSync(statePath)) {
      try {
        const leakedState = readJson(statePath);
        startedPid = leakedState.pid;
      } catch {}
      rmSync(statePath, { force: true });
    }
    killTree(startedPid);
    sandbox.cleanup();
  }
});

test('identity mismatch leaves the live process running and refuses to signal it', async () => {
  const sandbox = makeSandbox();
  try {
    const { manifestPath } = writeManifest(sandbox);
    const startResult = runHelper(['start-web', manifestPath, '--approved'], sandbox);
    assert.equal(startResult.status, 0, startResult.stderr);

    const statePath = path.join(sandbox.stateDir, 'pr-3178.qc.json');
    const originalState = readJson(statePath);
    writeJson(statePath, { ...originalState, processStartToken: 'tampered-token' });

    const statusResult = runHelper(['status', manifestPath], sandbox);
    assert.equal(statusResult.status, 0, statusResult.stderr);
    const statusPayload = JSON.parse(statusResult.stdout);
    assert.equal(statusPayload.status, 'stale');
    assert.equal(statusPayload.staleReason, 'identity-mismatch');

    const stopResult = runHelper(['stop', manifestPath], sandbox);
    assert.notEqual(stopResult.status, 0);
    assert.match(stopResult.stderr, /identity mismatch/i);
    assert.equal(isAlive(originalState.pid), true);
    assert.equal(existsSync(statePath), true);

    killTree(originalState.pid);
    rmSync(statePath, { force: true });
  } finally {
    sandbox.cleanup();
  }
});

test('inspect rejects paths outside the manifest worktree', async () => {
  const sandbox = makeSandbox();
  try {
    const { manifestPath } = writeManifest(sandbox);
    setGitState(sandbox, { head: 'abc123', diffPaths: ['../escape.txt'] });
    const result = runHelper(['inspect', manifestPath], sandbox);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /outside the manifest worktree/i);
  } finally {
    sandbox.cleanup();
  }
});

test('start-electron invokes electron:dev:bundled', async () => {
  const sandbox = makeSandbox();
  try {
    mkdirSync(path.join(sandbox.repoDir, 'node_modules'), { recursive: true });
    const { manifestPath } = writeManifest(sandbox);
    const result = runHelper(['start-electron', manifestPath, '--approved'], sandbox);
    assert.equal(result.status, 0, result.stderr);

    const state = readJson(path.join(sandbox.stateDir, 'pr-3178.qc.json'));
    assert.equal(state.mode, 'electron');
    assert.equal(typeof state.processStartToken, 'string');
    assert.notEqual(state.processStartToken, '');

    await waitFor(() => readJsonLines(sandbox.bunLogPath).length >= 1, 'expected electron bun call to be recorded');
    const bunCalls = readJsonLines(sandbox.bunLogPath);
    assert.equal(bunCalls.length, 1);
    assert.equal(bunCalls[0].args.join(' '), 'run electron:dev:bundled');

    await ensureStopped(manifestPath, sandbox);
  } finally {
    sandbox.cleanup();
  }
});
