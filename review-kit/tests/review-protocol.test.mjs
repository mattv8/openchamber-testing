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

test('protocol reviews the prepared checkout HEAD and treats PR state as context', () => {
  assert.match(PROTOCOL, /discovery mode/i);
  assert.match(PROTOCOL, /prepared mode/i);
  assert.match(PROTOCOL, /clean (?:current )?(?:checkout|worktree)/i);
  assert.match(PROTOCOL, /git rev-parse HEAD/i);
  assert.match(PROTOCOL, /reviewed SHA/i);
  assert.match(PROTOCOL, /review and validate the code at the recorded checkout HEAD|scope(?:s)? (?:the )?review to (?:the )?reviewed SHA/i);
  assert.match(PROTOCOL, /headRepository\.url/i);
  assert.match(PROTOCOL, /state(?:[^\n]|\n){0,120}as metadata/i);
  assert.match(PROTOCOL, /closed(?:[^\n]|\n){0,120}draft(?:[^\n]|\n){0,120}(?:conflict|CONFLICTING)(?:[^\n]|\n){0,160}review context(?:[^\n]|\n){0,160}not stop conditions/i);
  assert.match(PROTOCOL, /difference between the reviewed(?: checkout HEAD)? SHA and (?:current remote PR )?`headRefOid`(?:[^\n]|\n){0,160}review context(?:[^\n]|\n){0,160}not stop conditions/i);
  assert.match(PROTOCOL, /immediate(?:ly)? before (?:the )?verdict(?:[^\n]|\n){0,240}refresh(?:[^\n]|\n){0,240}metadata/i);
  assert.match(PROTOCOL, /git fetch --no-tags <headRepository\.url> <headRefName>/i);
  assert.match(PROTOCOL, /reviewed(?: checkout HEAD)? SHA(?:[^\n]|\n){0,200}(?:fetched\/remote PR HEAD|current remote PR HEAD) SHA(?:[^\n]|\n){0,200}(?:continue|exactly three outputs|required outputs)/i);
  assert.doesNotMatch(PROTOCOL, /git switch --detach FETCH_HEAD/i);
  assert.doesNotMatch(PROTOCOL, /FETCH_HEAD(?:[^\n]|\n){0,160}(?:equal|match|===?)(?:[^\n]|\n){0,160}headRefOid|headRefOid(?:[^\n]|\n){0,160}(?:equal|match|===?)(?:[^\n]|\n){0,160}FETCH_HEAD/i);
  assert.doesNotMatch(PROTOCOL, /(?:require|must be|only if)(?:[^\n]|\n){0,120}mergeable(?:[^\n]|\n){0,120}before review|before review(?:[^\n]|\n){0,120}(?:require|must be|only if)(?:[^\n]|\n){0,120}mergeable/i);
});

test('protocol keeps the prepared checkout unchanged and later phases review-only', () => {
  assert.match(PROTOCOL, /keep its checked-out files unchanged throughout review/i);
  assert.match(PROTOCOL, /review-only phase after validation|session is otherwise review-only/i);
});

test('protocol says candidate-spec SHA cannot block review', () => {
  assert.match(PROTOCOL, /zero or multiple results require an explicit PR-number override|explicit PR-number override/i);
  assert.match(PROTOCOL, /candidate-spec SHA cannot block review|candidate spec SHA.*cannot block review|older SHA recorded in a candidate spec(?:[^\n]|\n)*never blocks review/i);
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
  assert.match(TEMPLATE, /Reviewed checkout HEAD SHA/i);
  assert.match(TEMPLATE, /Current remote PR HEAD SHA/i);
  assert.doesNotMatch(TEMPLATE, /Pinned HEAD SHA/i);
  assert.doesNotMatch(TEMPLATE, /Record the verified bootstrap result/i);
  assert.match(TEMPLATE, /^## Trust boundaries and runtime reachability$/m);
  assert.match(TEMPLATE, /^## Review focus$/m);
  assert.match(TEMPLATE, /^## Manual QC launch hint$/m);
});

test('README describes prepared-checkout-HEAD review with a non-switching remote check', () => {
  assert.match(README, /clean checkout/i);
  assert.match(README, /prepared checkout(?:'s)? HEAD|prepared-checkout-HEAD/i);
  assert.match(README, /(?:final remote check|immediately before the verdict)(?:[^\n]|\n){0,160}(?:does not|without|never)(?:[^\n]|\n){0,80}(?:move|switch|detach)(?:[^\n]|\n){0,80}checkout/i);
  assert.doesNotMatch(README, /protocol fetches the current PR head|fetches and detaches .* current PR head/i);
});

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
