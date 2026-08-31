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

test('protocol keeps prepared and discovery entry gates tied to exact HEAD', () => {
  assert.match(PROTOCOL, /discovery mode/i);
  assert.match(PROTOCOL, /prepared mode/i);
  assert.match(PROTOCOL, /clean (?:current )?(?:checkout|worktree)/i);
  assert.match(PROTOCOL, /exact\s+HEAD|current checkout `HEAD` matches the pinned SHA/i);
  assert.match(PROTOCOL, /open state|open\/non-draft\/mergeable|open, non-draft, mergeable/i);
  assert.match(PROTOCOL, /draft state|non-draft/i);
  assert.match(PROTOCOL, /mergeability|mergeable/i);
  assert.match(PROTOCOL, /selected PR .* current checkout `HEAD`|HEAD matches the pinned SHA|head equality to the checkout/i);
});

test('protocol keeps inference and override pinned to the current checkout HEAD', () => {
  assert.match(PROTOCOL, /PRs associated with (?:that )?exact `HEAD` commit|associated with the exact commit/i);
  assert.match(PROTOCOL, /zero or multiple results require an explicit PR-number override|explicit PR-number override/i);
  assert.match(PROTOCOL, /override still must match `HEAD`|override .* match .*HEAD/i);
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
  assert.match(TEMPLATE, /^## Trust boundaries and runtime reachability$/m);
  assert.match(TEMPLATE, /^## Review focus$/m);
  assert.match(TEMPLATE, /^## Manual QC launch hint$/m);
});

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
