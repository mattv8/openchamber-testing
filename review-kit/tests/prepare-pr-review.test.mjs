import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT_PATH = '/Users/elfy/GitRepos/openchamber-testing/review-kit/bin/prepare-pr-review.mjs';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-pr-review-'));
}

function writeExecutable(filePath, contents) {
  fs.writeFileSync(filePath, contents);
  fs.chmodSync(filePath, 0o755);
}

function createStubEnvironment(overrides = {}) {
  const tempDir = makeTempDir();
  const sourceDir = path.join(tempDir, 'source');
  const reviewRoot = path.join(tempDir, 'reviews-root');
  const stateDir = path.join(tempDir, 'state');
  const fakeBin = path.join(tempDir, 'bin');
  const stubStatePath = path.join(tempDir, 'stub-state.json');

  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(reviewRoot, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });

  const stubState = {
    pr: {
      number: 123,
      title: 'Test PR',
      url: 'https://github.com/openchamber/openchamber/pull/123',
      state: 'OPEN',
      isDraft: false,
      mergeable: 'MERGEABLE',
      headRefOid: 'abc123def456',
    },
    fetchHead: 'abc123def456',
    mainSha: 'main789abc000',
    prRemote: 'upstream',
    worktrees: {},
    calls: [],
    ...overrides,
  };

  fs.writeFileSync(stubStatePath, JSON.stringify(stubState, null, 2));

  writeExecutable(
    path.join(fakeBin, 'gh'),
    `#!/usr/bin/env node
const fs = require('node:fs');
const statePath = process.env.STUB_STATE_PATH;
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
state.calls.push({ tool: 'gh', args: process.argv.slice(2) });
fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
if (process.argv[2] === 'pr' && process.argv[3] === 'view') {
  process.stdout.write(JSON.stringify(state.pr));
  process.exit(0);
}
process.stderr.write('unexpected gh invocation');
process.exit(1);
`,
  );

  writeExecutable(
    path.join(fakeBin, 'git'),
    String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const statePath = process.env.STUB_STATE_PATH;
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const args = process.argv.slice(2);
state.calls.push({ tool: 'git', args });

function save() {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function worktreeForPath(targetPath) {
  return state.worktrees[targetPath] || null;
}

if (args[0] === 'fetch') {
  const remote = args[1];
  const ref = args[2];
  if (remote !== state.prRemote) {
    save();
    process.stderr.write('wrong remote: ' + remote);
    process.exit(1);
  }
  if (ref === 'main') {
    state.fetchHead = state.mainSha;
    save();
    process.exit(0);
  }
  if (ref === 'pull/' + state.pr.number + '/head') {
    state.fetchHead = state.pr.headRefOid;
    save();
    process.exit(0);
  }
  save();
  process.stderr.write('unexpected fetch ref: ' + String(ref));
  process.exit(1);
}

if (args[0] === 'rev-parse' && args[1] === 'FETCH_HEAD') {
  save();
  process.stdout.write(String(state.fetchHead) + '\n');
  process.exit(0);
}

if (args[0] === 'worktree' && args[1] === 'add' && args[2] === '--detach') {
  const targetPath = args[3];
  const sha = args[4];
  fs.mkdirSync(targetPath, { recursive: true });
  state.worktrees[targetPath] = { head: sha, dirty: false };
  save();
  process.exit(0);
}

if (args[0] === '-C') {
  const targetPath = args[1];
  const worktree = worktreeForPath(targetPath);
  if (!worktree) {
    save();
    process.stderr.write('missing worktree');
    process.exit(1);
  }

  if (args[2] === 'status' && args[3] === '--porcelain') {
    save();
    process.stdout.write(worktree.dirty ? ' M file.txt\n' : '');
    process.exit(0);
  }

  if (args[2] === 'rev-parse' && args[3] === 'HEAD') {
    save();
    process.stdout.write(String(worktree.head) + '\n');
    process.exit(0);
  }
}

save();
process.stderr.write('unexpected git invocation: ' + args.join(' '));
process.exit(1);
`,
  );

  return { tempDir, sourceDir, reviewRoot, stateDir, fakeBin, stubStatePath };
}

function readStubState(stubStatePath) {
  return JSON.parse(fs.readFileSync(stubStatePath, 'utf8'));
}

function canonicalTargetPath(reviewRoot, slug) {
  return path.join(fs.realpathSync(reviewRoot), slug);
}

function runPrepare({ prNumber = '123', slug = 'good-slug', env = {} } = {}) {
  const result = spawnSync('node', [SCRIPT_PATH, prNumber, slug], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  });

  return {
    ...result,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function buildEnv(stub, extra = {}) {
  return {
    PATH: `${stub.fakeBin}:${process.env.PATH}`,
    STUB_STATE_PATH: stub.stubStatePath,
    OPENCHAMBER_SOURCE_DIR: stub.sourceDir,
    OPENCHAMBER_REVIEW_ROOT: stub.reviewRoot,
    OPENCHAMBER_REVIEW_STATE_DIR: stub.stateDir,
    ...extra,
  };
}

test('rejects non-numeric PR input', () => {
  const stub = createStubEnvironment();
  const result = runPrepare({
    prNumber: 'abc',
    env: buildEnv(stub),
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PR number/i);
});

test('rejects unsafe slug input', () => {
  const stub = createStubEnvironment();
  const result = runPrepare({
    slug: '../bad',
    env: buildEnv(stub),
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /slug/i);
});

test('rejects draft pull requests', () => {
  const stub = createStubEnvironment({
    pr: { number: 123, title: 'Draft PR', url: 'https://github.com/openchamber/openchamber/pull/123', state: 'OPEN', isDraft: true, mergeable: 'MERGEABLE', headRefOid: 'abc123def456' },
  });
  const result = runPrepare({
    env: buildEnv(stub),
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /draft/i);
});

test('rejects closed pull requests', () => {
  const stub = createStubEnvironment({
    pr: { number: 123, title: 'Closed PR', url: 'https://github.com/openchamber/openchamber/pull/123', state: 'CLOSED', isDraft: false, mergeable: 'MERGEABLE', headRefOid: 'abc123def456' },
  });
  const result = runPrepare({
    env: buildEnv(stub),
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /closed|open/i);
});

test('rejects non-mergeable pull requests', () => {
  const stub = createStubEnvironment({
    pr: { number: 123, title: 'Blocked PR', url: 'https://github.com/openchamber/openchamber/pull/123', state: 'OPEN', isDraft: false, mergeable: 'CONFLICTING', headRefOid: 'abc123def456' },
  });
  const result = runPrepare({
    env: buildEnv(stub),
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /mergeable/i);
});

test('creates a detached worktree pinned to headRefOid', () => {
  const stub = createStubEnvironment();
  const worktreePath = canonicalTargetPath(stub.reviewRoot, 'detached-worktree');
  const result = runPrepare({
    slug: 'detached-worktree',
    env: buildEnv(stub),
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.headSha, 'abc123def456');
  assert.equal(payload.worktreePath, worktreePath);
  assert.equal(payload.removeWorktreeOnCleanup, true);

  const stubState = readStubState(stub.stubStatePath);
  assert.deepEqual(stubState.worktrees[worktreePath], { head: 'abc123def456', dirty: false });
});

test('fetches main then pull head from upstream and verifies FETCH_HEAD after the PR fetch', () => {
  const stub = createStubEnvironment();
  const result = runPrepare({
    slug: 'fetch-order',
    env: buildEnv(stub),
  });

  assert.equal(result.status, 0, result.stderr);
  const stubState = readStubState(stub.stubStatePath);
  const gitCalls = stubState.calls.filter((call) => call.tool === 'git');
  assert.deepEqual(gitCalls.slice(0, 3).map((call) => call.args), [
    ['fetch', 'upstream', 'main'],
    ['fetch', 'upstream', 'pull/123/head'],
    ['rev-parse', 'FETCH_HEAD'],
  ]);
});

test('allows overriding OPENCHAMBER_PR_REMOTE', () => {
  const stub = createStubEnvironment({ prRemote: 'fork-remote' });
  const result = runPrepare({
    slug: 'remote-override',
    env: buildEnv(stub, { OPENCHAMBER_PR_REMOTE: 'fork-remote' }),
  });

  assert.equal(result.status, 0, result.stderr);
  const stubState = readStubState(stub.stubStatePath);
  const fetchCalls = stubState.calls.filter((call) => call.tool === 'git' && call.args[0] === 'fetch');
  assert.deepEqual(fetchCalls.map((call) => call.args[1]), ['fork-remote', 'fork-remote']);
});

test('returns an existing clean worktree when SHA matches', () => {
  const stub = createStubEnvironment();
  const existingPath = canonicalTargetPath(stub.reviewRoot, 'existing-clean');
  fs.mkdirSync(existingPath, { recursive: true });
  const existingState = readStubState(stub.stubStatePath);
  existingState.worktrees[existingPath] = { head: 'abc123def456', dirty: false };
  fs.writeFileSync(stub.stubStatePath, JSON.stringify(existingState, null, 2));

  const result = runPrepare({
    slug: 'existing-clean',
    env: buildEnv(stub),
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.removeWorktreeOnCleanup, false);
  const stubState = readStubState(stub.stubStatePath);
  const addCalls = stubState.calls.filter((call) => call.tool === 'git' && call.args[0] === 'worktree');
  assert.equal(addCalls.length, 0);
});

test('refuses an existing dirty worktree', () => {
  const stub = createStubEnvironment();
  const existingPath = canonicalTargetPath(stub.reviewRoot, 'dirty-worktree');
  fs.mkdirSync(existingPath, { recursive: true });
  const existingState = readStubState(stub.stubStatePath);
  existingState.worktrees[existingPath] = { head: 'abc123def456', dirty: true };
  fs.writeFileSync(stub.stubStatePath, JSON.stringify(existingState, null, 2));

  const result = runPrepare({
    slug: 'dirty-worktree',
    env: buildEnv(stub),
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /dirty/i);
});

test('refuses an existing worktree pinned to a different SHA', () => {
  const stub = createStubEnvironment();
  const existingPath = canonicalTargetPath(stub.reviewRoot, 'wrong-sha');
  fs.mkdirSync(existingPath, { recursive: true });
  const existingState = readStubState(stub.stubStatePath);
  existingState.worktrees[existingPath] = { head: 'ffffffffff', dirty: false };
  fs.writeFileSync(stub.stubStatePath, JSON.stringify(existingState, null, 2));

  const result = runPrepare({
    slug: 'wrong-sha',
    env: buildEnv(stub),
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /head|sha|match/i);
});

test('writes the exact manifest fields', () => {
  const stub = createStubEnvironment();
  const worktreePath = canonicalTargetPath(stub.reviewRoot, 'manifest-check');
  const result = runPrepare({
    slug: 'manifest-check',
    env: buildEnv(stub),
  });

  assert.equal(result.status, 0, result.stderr);
  const manifestPath = path.join(stub.stateDir, 'pr-123.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.deepEqual(Object.keys(manifest).sort(), [
    'createdAt',
    'headSha',
    'holdingCommentUrl',
    'prNumber',
    'removeWorktreeOnCleanup',
    'slug',
    'title',
    'url',
    'worktreePath',
  ]);
  assert.equal(manifest.prNumber, 123);
  assert.equal(manifest.slug, 'manifest-check');
  assert.equal(manifest.title, 'Test PR');
  assert.equal(manifest.url, 'https://github.com/openchamber/openchamber/pull/123');
  assert.equal(manifest.headSha, 'abc123def456');
  assert.equal(manifest.worktreePath, worktreePath);
  assert.equal(manifest.holdingCommentUrl, null);
  assert.equal(manifest.removeWorktreeOnCleanup, true);
  assert.match(manifest.createdAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('rejects a target path outside OPENCHAMBER_REVIEW_ROOT', () => {
  const stub = createStubEnvironment();
  fs.mkdirSync(path.join(stub.tempDir, 'elsewhere'), { recursive: true });
  fs.rmSync(stub.reviewRoot, { recursive: true, force: true });
  fs.symlinkSync(path.join(stub.tempDir, 'elsewhere'), stub.reviewRoot);

  const result = runPrepare({
    slug: 'symlink-escape',
    env: buildEnv(stub),
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /outside|review root/i);
});

test('rejects an existing target symlink before invoking git worktree add', () => {
  const stub = createStubEnvironment();
  const escapeDir = path.join(stub.tempDir, 'escape-target');
  const targetPath = path.join(stub.reviewRoot, 'target-symlink');
  fs.mkdirSync(escapeDir, { recursive: true });
  fs.symlinkSync(escapeDir, targetPath);

  const result = runPrepare({
    slug: 'target-symlink',
    env: buildEnv(stub),
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /symlink|outside|review root/i);
  const stubState = readStubState(stub.stubStatePath);
  const addCalls = stubState.calls.filter((call) => call.tool === 'git' && call.args[0] === 'worktree');
  assert.equal(addCalls.length, 0);
});

test('rejects a symlinked parent inside the review root before invoking git worktree add', () => {
  const stub = createStubEnvironment();
  const escapeDir = path.join(stub.tempDir, 'escape-parent');
  const parentPath = path.join(stub.reviewRoot, 'nested');
  fs.mkdirSync(escapeDir, { recursive: true });
  fs.symlinkSync(escapeDir, parentPath);

  const result = runPrepare({
    slug: 'nested-child',
    env: buildEnv(stub, { OPENCHAMBER_REVIEW_ROOT: parentPath }),
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /symlink|outside|review root/i);
  const stubState = readStubState(stub.stubStatePath);
  const addCalls = stubState.calls.filter((call) => call.tool === 'git' && call.args[0] === 'worktree');
  assert.equal(addCalls.length, 0);
});
