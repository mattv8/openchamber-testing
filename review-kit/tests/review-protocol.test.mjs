import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..', '..');

const README_PATH = path.join(REPO_ROOT, 'README.md');
const PROTOCOL_PATH = path.join(REPO_ROOT, 'review-kit', 'REVIEW_PROTOCOL.md');
const TEMPLATE_PATH = path.join(REPO_ROOT, 'review-kit', 'templates', 'pr-review-spec.md');

const README = fs.readFileSync(README_PATH, 'utf8');
const PROTOCOL = fs.readFileSync(PROTOCOL_PATH, 'utf8');
const TEMPLATE = fs.readFileSync(TEMPLATE_PATH, 'utf8');

const DISCOVERED_SPEC_ROOT = '/Users/elfy/GitRepos/openchamber-testing/.scratch/pr-reviews/live/';
const REVIEWER_KIT_COMMANDS = [
  'Read /Users/elfy/GitRepos/openchamber-testing/review-kit/REVIEW_PROTOCOL.md and begin in discovery mode for this checkout.',
  'Read /Users/elfy/GitRepos/openchamber-testing/review-kit/REVIEW_PROTOCOL.md and begin in discovery mode for PR #3227 in this checkout.',
];
const COMPLETE_TEST_SUITE_COMMAND = 'node --test review-kit/tests/prepare-pr-review.test.mjs review-kit/tests/pr-qc.test.mjs review-kit/tests/review-protocol.test.mjs';
const ABSOLUTE_LIVE_SPEC_PATH = `${DISCOVERED_SPEC_ROOT}pr-<number>.md`;

test('README keeps the exact reviewer-kit kickoff prompts and suite command', () => {
  assert.match(README, /^## Reviewer kit$/m);
  for (const prompt of REVIEWER_KIT_COMMANDS) {
    assert.match(README, new RegExp(escapeRegex(prompt)));
  }
  assert.match(README, new RegExp(escapeRegex(COMPLETE_TEST_SUITE_COMMAND)));
});

test('protocol bootstraps the review checkout at the PR current head', () => {
  assert.match(PROTOCOL, /discovery mode/i);
  assert.match(PROTOCOL, /prepared mode/i);
  assert.match(PROTOCOL, /clean (?:current )?(?:checkout|worktree)/i);
  assert.match(PROTOCOL, /headRepository\.url/i);
  assert.match(PROTOCOL, /git fetch --no-tags/i);
  assert.match(PROTOCOL, /git rev-parse FETCH_HEAD/i);
  assert.match(PROTOCOL, /git switch --detach FETCH_HEAD/i);
  assert.match(PROTOCOL, /open state|open\/non-draft\/mergeable|open, non-draft, mergeable/i);
  assert.match(PROTOCOL, /draft state|non-draft/i);
  assert.match(PROTOCOL, /mergeability|mergeable/i);
  assert.match(PROTOCOL, /refresh(?: the)? current PR metadata(?:[^\n]|\n)*repeat(?:[^\n]|\n)*(?:once|second attempt)|branch moved(?:[^\n]|\n)*refresh(?:[^\n]|\n)*(?:once|second attempt)/i);
});

test('protocol keeps bootstrap as the only checkout mutation and later phases review-only', () => {
  assert.match(PROTOCOL, /only permitted(?:[^\n]|\n)*(?:checkout )?mutations(?:[^\n]|\n)*bootstrap commands|bootstrap commands(?:[^\n]|\n)*only permitted(?:[^\n]|\n)*(?:checkout )?mutations/i);
  assert.match(PROTOCOL, /review-only phase after bootstrap|after bootstrap(?:[^\n]|\n)*review-only/i);
  assert.doesNotMatch(PROTOCOL, /candidate spec(?:[^\n]|\n){0,120}block bootstrap|bootstrap(?:[^\n]|\n){0,120}blocked by(?:[^\n]|\n){0,80}candidate spec SHA/i);
});

test('protocol says candidate-spec SHA cannot block bootstrap', () => {
  assert.match(PROTOCOL, /zero or multiple results require an explicit PR-number override|explicit PR-number override/i);
  assert.match(PROTOCOL, /candidate-spec SHA cannot block bootstrap|candidate spec SHA.*cannot block bootstrap|bootstrap before candidate-spec SHA validation|older SHA recorded in a candidate spec(?:[^\n]|\n)*never blocks bootstrap/i);
});

test('protocol and template keep live-spec writes isolated and transactional', () => {
  assert.match(PROTOCOL, new RegExp(escapeRegex(ABSOLUTE_LIVE_SPEC_PATH)));
  assert.match(TEMPLATE, new RegExp(escapeRegex(DISCOVERED_SPEC_ROOT)));
  assert.match(PROTOCOL, /placeholder-free complete spec|full template with no placeholders|leave no prose placeholders behind/i);
  assert.match(PROTOCOL, /writes nothing to the OpenChamber checkout|do not write .*OpenChamber checkout/i);
  assert.match(PROTOCOL, /leave(?:s)? the old live spec untouched(?: on failure)?/i);
});

test('protocol and template preserve review-only handoff and final outputs', () => {
  assert.match(PROTOCOL, /review-only phase after validation|review only/i);
  assert.match(PROTOCOL, /at most three subagent sessions|up to three subagent sessions/i);
  assert.match(PROTOCOL, /never multiple reviewers|never run multiple reviewers/i);
  assert.match(PROTOCOL, /exactly three outputs/i);
  assert.match(TEMPLATE, /Reviewed HEAD SHA/i);
  assert.doesNotMatch(TEMPLATE, /Pinned HEAD SHA/i);
  assert.match(TEMPLATE, /^## Trust boundaries and runtime reachability$/m);
  assert.match(TEMPLATE, /^## Review focus$/m);
  assert.match(TEMPLATE, /^## Manual QC launch hint$/m);
});

test('README describes clean checkout bootstrap at the current PR head', () => {
  assert.match(README, /clean checkout/i);
  assert.match(README, /protocol fetches the current PR head|fetches and detaches .* current PR head/i);
  assert.doesNotMatch(README, /already checked out at the PR'?s exact head|already needs the PR'?s exact head/i);
});

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
