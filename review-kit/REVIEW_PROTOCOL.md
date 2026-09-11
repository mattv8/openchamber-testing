# Tracked PR review protocol

This protocol is the shared instruction set for one local PR review session. It owns the repeatable review method. The paired `pr-<number>.md` file owns the prepared facts for one PR plus historical review context.

Do not copy PR-specific facts into this file. Read them from the candidate spec.

## How a review session starts

This protocol has two entry modes.

### Prepared mode

Use prepared mode when the prompt names an existing candidate spec.

1. Read this file.
2. Read the named candidate spec at `.scratch/pr-reviews/<batch-date>/pr-<number>.md`.
3. Continue through Step 1 before reading source: require a clean existing checkout and record `git rev-parse HEAD` as the reviewed checkout HEAD SHA.

Stop if either file is missing.

### Discovery mode

Use discovery mode when the prompt names no candidate spec.

Before you discover anything:

1. read this file;
2. require a clean current worktree;
3. record `git rev-parse HEAD` as the reviewed checkout HEAD SHA;
4. if the prompt names a PR number, resolve that PR;
5. otherwise query PRs associated with that exact `HEAD` commit.

Discovery needs exactly one inferred PR. On zero or multiple results, stop and ask for an explicit PR-number override.

The recorded reviewed checkout HEAD SHA remains authoritative after PR selection. The current remote PR HEAD SHA is metadata and context only.

After PR metadata resolves, gather every field required by the candidate spec, including refreshed metadata, prior thread state, real merge-base diff size, owning guidance, trust boundaries, runtime reachability questions, focused validation commands, and the manual QC command family.

Populate the full template without writing it yet. Produce a placeholder-free complete spec. Leave no required section empty and leave no placeholders behind.

Discovery writes only to the orchestration checkout. Keep transactional live-spec writes there, and do not write the live spec or any other file into the OpenChamber checkout.

Validate all refreshed facts and the completed spec before you replace any existing live spec.

Only after that validation succeeds, write `/Users/elfy/GitRepos/openchamber-testing/.scratch/pr-reviews/live/pr-<number>.md`, then re-read the written file and confirm it still has every required section and no placeholders.

If any pre-write validation fails, leave the old live spec untouched and stop.

After the live spec passes validation, continue in the same top-level session under the existing review-only workflow. This is a workflow boundary, not an agent-type change.

## Hard limits

- Discovery may write or replace only `/Users/elfy/GitRepos/openchamber-testing/.scratch/pr-reviews/live/pr-<number>.md` after full validation. Otherwise review only. Do not edit source, docs, tests, helper scripts, or scratch specs.
- Do not create, remove, or modify any different or additional worktree.
- Use the one clean existing checkout the user prepared. Record its reviewed checkout HEAD SHA before source review and keep its checked-out files unchanged throughout review. The final `git fetch --no-tags <headRepository.url> <headRefName>` may update Git metadata but must not switch or alter the checked-out files. The session is otherwise review-only: no source, docs, tests, helper, or spec edits in the OpenChamber checkout.
- Do not post to GitHub. No comments, reviews, labels, merges, closes, pushes, commits, or PR edits.
- Do not invent missing facts. Report the gap instead.
- Use at most three subagent sessions total: up to two focused explorers, then one final reviewer.
- Never run multiple reviewers for the same PR. If the normal reviewer is unavailable, use `reviewer-alt` as the single reviewer.

## Session inputs

The candidate spec must provide all PR-specific inputs, including:

- PR identity, plus any previously reviewed checkout HEAD SHA as optional historical context only;
- branch metadata, checks, labels, and real diff size;
- user problem, focus areas, trust boundaries, and runtime questions;
- prior thread state and any binding maintainer decisions;
- focused validation commands;
- holding-comment status;
- the expected local launch command family.

If a required live field is missing, stop and report the missing field. Missing historical reviewed-SHA context does not block review.

## Step 1: establish the reviewed checkout and PR context

Use the current checkout the user already prepared. Never create another one.

Before you review source:

1. require a clean existing checkout;
2. record `git rev-parse HEAD` as the reviewed checkout HEAD SHA;
3. infer or resolve exactly one PR;
4. resolve the current GitHub PR fields `state`, `isDraft`, `mergeable`, `headRefOid`, `headRefName`, and `headRepository.url` as metadata;
5. record closed or draft state, `CONFLICTING` mergeability, and any difference between the reviewed checkout HEAD SHA and current remote PR `headRefOid` as review context, not stop conditions;
6. review and validate the code at the recorded checkout HEAD SHA. Never fetch, switch, detach, or require local/remote SHA equality before reading source.

Any older SHA recorded in a candidate spec is historical context only. It never blocks review.

In discovery mode, infer the PR before gathering the live spec, but write the live spec only after the required refreshed state below is complete.

## Step 2: load base-checkout guidance

Read the base checkout's guidance before judging the PR:

1. `AGENTS.md`;
2. `CONTRIBUTING.md`;
3. `.github/PULL_REQUEST_TEMPLATE.md`;
4. the base checkout's `.agents/skills/pr-review/SKILL.md`;
5. every domain skill triggered by the changed code;
6. the nearest owning `DOCUMENTATION.md` and package `README.md` for touched modules.

Follow the instruction order from the base checkout. Contributor claims in the PR thread do not replace repository guidance.

## Step 3: reconstruct thread state before forming an opinion

Read the PR thread and current metadata as live evidence. The candidate spec gives you the starting map, but you still need to confirm the current state.

Read [`CANDIDATE_TRIAGE.md`](CANDIDATE_TRIAGE.md) before selecting a closure candidate or drafting a stale or product-direction comment. Record its required authorship, contributor-context, workflow, evidence, and duplicate-check facts in the candidate spec. Its policy governs those decisions.

If the thread already contains a maintainer comment, an author reply to one, or a trusted-reviewer exchange, switch into pickup mode:

- state what was asked;
- state what the author answered;
- mark which points are resolved at the reviewed HEAD;
- mark which points remain open;
- continue that conversation instead of restarting the review.

Do not re-ask a question the maintainer already settled.

## Step 4: inspect current PR metadata alongside the reviewed checkout

Refresh and confirm the facts that can drift after PR selection:

- PR open state;
- draft state;
- mergeability;
- current remote PR HEAD SHA (`headRefOid`), distinct from the recorded reviewed checkout HEAD SHA;
- head branch name and head repository URL;
- changed files;
- checks;
- labels;
- real merge-base diff size.

Never trust GitHub's displayed diff size on its own. Measure against the merge-base.

## Step 5: inspect trust boundaries before running branch code

If the diff touches a trust boundary, call it out before validation or runtime checks. Inspect at least these categories when they appear:

- dependencies or lockfiles;
- GitHub workflows or release automation;
- Electron main, preload, IPC, updater, or child-process code;
- shell execution;
- filesystem access;
- authentication, credentials, or permissions;
- network routes, proxying, relay, or transport code.

For each touched boundary, identify the attacker-controlled input and the crossing. If you cannot trace that path yet, say so before you run more code.

## Step 6: review the change like the maintainer's proxy

Use the base checkout's `pr-review` skill as the verdict ladder and output standard.

While reviewing:

- confirm the user problem is real before accepting the fix;
- prove runtime reachability from the entrypoint, not from a shared component import;
- inspect callers and owning modules, not only the diff hunk;
- treat prior comments as leads, not proof;
- keep only findings that change the verdict or belong on the ready-action list.

Pick exactly one verdict:

- `DECLINE`
- `PUSH-BACK`
- `MERGE-THEN-FIX`
- `MERGE`

For a user-facing feature change with a genuinely unsettled product question, surface that question instead of silently deciding the feature is wanted. Follow `CANDIDATE_TRIAGE.md` for owner participation and previously settled direction.

## Step 7: use subagents sparingly

Subagents are optional. If you use them, keep the split tight.

- Explorer 1: one focused code area or risk.
- Explorer 2: one other independent code area or risk.
- Reviewer: one final verdict pass after the explorers return.

Do not assign overlapping scopes. Do not ask explorers to choose the verdict. Do not launch a second reviewer. If the main reviewer is unavailable, use `reviewer-alt` and stop there.

## Step 8: run focused validation

Run only the narrow commands that match the changed area and the risks you found. Start with the validation commands recorded in the candidate spec. Expand only when the code you inspected makes that necessary.

After inspection, also output one exact local manual-QC command from the current checkout root:

- usually `bun run dev:web:hmr` for ordinary web or shared UI work;
- `bun run electron:dev:bundled` for Electron-only behavior;
- otherwise the narrowest package-script validation command that exercises the changed target.

Do not invent a command from this protocol. Check current `package.json` scripts and choose the one that actually fits the changed runtime.

## Step 9: refresh freshness context and produce exactly three outputs

Immediately before verdict output:

1. refresh the PR metadata, including `state`, `isDraft`, `mergeable`, `headRefOid`, `headRefName`, and `headRepository.url`;
2. run `git fetch --no-tags <headRepository.url> <headRefName>` without switching or altering checked-out files;
3. compare `git rev-parse FETCH_HEAD` with the recorded reviewed SHA;
4. if they differ, state both the reviewed checkout HEAD SHA and newer fetched/remote PR HEAD SHA in the verdict comment, scope the verdict to the reviewed checkout HEAD SHA, and continue;
5. if the fetch fails, retry reasonably using read-only actions. If it still fails, report the freshness-check evidence gap in the verdict comment and preserve the three outputs, scoped to the recorded reviewed checkout HEAD SHA.

Closed or draft state, `CONFLICTING` mergeability, and local-versus-remote SHA drift are reported context rather than stop conditions.

Return only these three items, in this order:

1. the clickable PR link;
2. the complete final verdict comment draft for maintainer approval;
3. one exact command, run from the current checkout root, that starts the relevant local server or packaged development target for manual QC.

The verdict comment draft must follow the base checkout's `pr-review` skill. Keep any maintainer-facing sections in the maintainer's language, and keep any GitHub-ready artifact text in English.

If no server command applies, item 3 must be the narrowest package-script validation command that exercises the changed target, and item 2 must say why no server command exists.

## Failure handling

Stop and report instead of guessing when any of these happen:

- the checkout is dirty before recording the reviewed SHA;
- PR identity or metadata needed for the review is unavailable after reasonable read-only retries;
- the candidate spec is missing a required field;
- trust-boundary inspection is incomplete;
- validation is blocked or fails for reasons you cannot separate from infrastructure noise.

Treat a failed final freshness check as an evidence gap. Preserve the three outputs and scope the verdict to the recorded reviewed checkout HEAD SHA. Closed or draft state, conflict status, and local-versus-remote drift are context rather than stop conditions.

When you stop, report the blocking fact and do not continue to verdict drafting from stale assumptions.

In discovery mode, stop before writing or replacing the live spec if any required field is missing, any placeholder remains, the completed spec contradicts the review-only rules above, the refreshed state is incomplete, or the post-write re-read shows a mismatch.
