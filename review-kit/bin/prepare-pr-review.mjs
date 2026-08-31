#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DEFAULT_SOURCE_DIR = '/Users/elfy/GitRepos/openchamber';
const DEFAULT_REVIEW_ROOT = '/Users/elfy/.local/share/opencode/worktree/2b2c6436413de5817e016064a5f0cd60dc427bd2';
const DEFAULT_STATE_DIR = '/Users/elfy/GitRepos/openchamber-testing/.scratch/pr-reviews';
const DEFAULT_PR_REMOTE = 'upstream';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });

  if (result.status !== 0) {
    const details = (result.stderr || result.stdout || '').trim();
    fail(details ? `${command} failed: ${details}` : `${command} failed`);
  }

  return (result.stdout || '').trim();
}

function isSafeSlug(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isInsideRoot(rootPath, targetPath) {
  const relativePath = path.relative(rootPath, targetPath);
  return relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`) && relativePath !== '' && !path.isAbsolute(relativePath);
}

function resolveTargetPath(reviewRoot, slug) {
  const rootPath = path.resolve(reviewRoot);
  if (!fs.existsSync(rootPath)) {
    fs.mkdirSync(rootPath, { recursive: true });
  }

  if (fs.lstatSync(rootPath).isSymbolicLink()) {
    fail('Target worktree path is outside OPENCHAMBER_REVIEW_ROOT');
  }

  const realRootPath = fs.realpathSync(rootPath);
  const targetPath = path.join(realRootPath, slug);

  if (fs.existsSync(targetPath) && fs.lstatSync(targetPath).isSymbolicLink()) {
    fail('Target worktree path is outside OPENCHAMBER_REVIEW_ROOT');
  }

  const resolvedTarget = fs.existsSync(targetPath)
    ? fs.realpathSync(targetPath)
    : targetPath;

  if (!isInsideRoot(realRootPath, resolvedTarget)) {
    fail('Target worktree path is outside OPENCHAMBER_REVIEW_ROOT');
  }

  return resolvedTarget;
}

function readPrInfo(sourceDir, prNumber) {
  const raw = runCommand(
    'gh',
    [
      'pr',
      'view',
      String(prNumber),
      '-R',
      'openchamber/openchamber',
      '--json',
      'number,title,url,state,isDraft,mergeable,headRefOid',
    ],
    { cwd: sourceDir },
  );

  let pr;
  try {
    pr = JSON.parse(raw);
  } catch {
    fail('gh returned invalid PR JSON');
  }

  if (pr.isDraft) {
    fail('Pull request is draft');
  }

  if (pr.state !== 'OPEN') {
    fail('Pull request is not open');
  }

  if (pr.mergeable !== 'MERGEABLE') {
    fail(`Pull request is not mergeable: ${pr.mergeable}`);
  }

  return pr;
}

function verifyFetchedHead(sourceDir, prNumber, prRemote, headSha) {
  runCommand('git', ['fetch', prRemote, 'main'], { cwd: sourceDir });
  runCommand('git', ['fetch', prRemote, `pull/${prNumber}/head`], { cwd: sourceDir });
  const fetchedHead = runCommand('git', ['rev-parse', 'FETCH_HEAD'], { cwd: sourceDir });

  if (fetchedHead !== headSha) {
    fail(`FETCH_HEAD ${fetchedHead} does not match PR head ${headSha}`);
  }
}

function ensureCleanWorktree(worktreePath, expectedHeadSha) {
  const status = runCommand('git', ['-C', worktreePath, 'status', '--porcelain']);
  if (status !== '') {
    fail('Existing worktree is dirty');
  }

  const headSha = runCommand('git', ['-C', worktreePath, 'rev-parse', 'HEAD']);
  if (headSha !== expectedHeadSha) {
    fail(`Existing worktree HEAD ${headSha} does not match ${expectedHeadSha}`);
  }
}

function ensureWorktree(sourceDir, worktreePath, headSha) {
  if (fs.existsSync(worktreePath)) {
    ensureCleanWorktree(worktreePath, headSha);
    return false;
  }

  runCommand('git', ['worktree', 'add', '--detach', worktreePath, headSha], { cwd: sourceDir });
  ensureCleanWorktree(worktreePath, headSha);
  return true;
}

function writeManifest(stateDir, manifest) {
  fs.mkdirSync(stateDir, { recursive: true });
  const manifestPath = path.join(stateDir, `pr-${manifest.prNumber}.json`);
  const tempPath = `${manifestPath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.renameSync(tempPath, manifestPath);
}

function main() {
  const [prNumberArg, slug] = process.argv.slice(2);

  if (!/^\d+$/.test(prNumberArg || '')) {
    fail('PR number must be numeric');
  }

  if (!isSafeSlug(slug || '')) {
    fail('Slug must contain only lowercase letters, numbers, and hyphens');
  }

  const sourceDir = process.env.OPENCHAMBER_SOURCE_DIR || DEFAULT_SOURCE_DIR;
  const reviewRoot = process.env.OPENCHAMBER_REVIEW_ROOT || DEFAULT_REVIEW_ROOT;
  const stateDir = process.env.OPENCHAMBER_REVIEW_STATE_DIR || DEFAULT_STATE_DIR;
  const prRemote = process.env.OPENCHAMBER_PR_REMOTE || DEFAULT_PR_REMOTE;
  const prNumber = Number(prNumberArg);

  const targetPath = resolveTargetPath(reviewRoot, slug);
  const pr = readPrInfo(sourceDir, prNumber);

  verifyFetchedHead(sourceDir, prNumber, prRemote, pr.headRefOid);
  const removeWorktreeOnCleanup = ensureWorktree(sourceDir, targetPath, pr.headRefOid);

  const manifest = {
    prNumber: pr.number,
    title: pr.title,
    url: pr.url,
    headSha: pr.headRefOid,
    worktreePath: targetPath,
    slug,
    removeWorktreeOnCleanup,
    createdAt: new Date().toISOString(),
    holdingCommentUrl: null,
  };

  writeManifest(stateDir, manifest);
  process.stdout.write(`${JSON.stringify(manifest)}\n`);
}

main();
