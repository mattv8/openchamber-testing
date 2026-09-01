# PR review candidate spec

Use this template for one local candidate file at `.scratch/pr-reviews/<batch-date>/pr-<number>.md` or `/Users/elfy/GitRepos/openchamber-testing/.scratch/pr-reviews/live/pr-<number>.md`.

Replace every `{{TOKEN}}`. Leave no prose placeholders behind.

## PR identity

- PR number: `{{PR_NUMBER}}`
- PR link: `{{PR_URL}}`
- Title: `{{PR_TITLE}}`
- Author: `{{PR_AUTHOR}}`
- Base branch: `{{PR_BASE}}`
- Head branch: `{{PR_HEAD_BRANCH}}`
- Reviewed HEAD SHA: `{{PR_HEAD_SHA}}`

## Current PR state after bootstrap

- Open state: `{{PR_STATE}}`
- Draft state: `{{PR_DRAFT_STATE}}`
- Mergeability: `{{PR_MERGEABILITY}}`
- Latest author commit time: `{{PR_LATEST_AUTHOR_COMMIT_AT}}`
- Checks summary: `{{PR_CHECKS_SUMMARY}}`
- Labels: `{{PR_LABELS}}`
- Real merge-base diff size: `{{PR_MERGE_BASE_DIFF_SIZE}}`

## Why this is worth reviewing now

- User problem: `{{USER_PROBLEM}}`
- Why this PR is a useful review candidate now: `{{CANDIDATE_REASON}}`

## Changed areas

- Changed files or subsystems: `{{CHANGED_AREAS}}`
- Owning documentation to read: `{{OWNING_DOCS}}`
- Required skills to load after `AGENTS.md`: `{{REQUIRED_SKILLS}}`

## Trust boundaries and runtime reachability

- Trust-boundary files or behaviors to inspect first: `{{TRUST_BOUNDARIES}}`
- Runtime reachability questions to prove from entrypoints: `{{RUNTIME_REACHABILITY_QUESTIONS}}`

## Prior thread state

- Prior thread summary: `{{PRIOR_THREAD_STATE}}`
- Binding maintainer decisions to continue, not re-ask: `{{BINDING_MAINTAINER_DECISIONS}}`

## Review focus

- Concrete review focus: `{{REVIEW_FOCUS}}`
- Focused validation commands: `{{FOCUSED_VALIDATION_COMMANDS}}`

## Holding comment status

- Unposted holding comment draft: `{{HOLDING_COMMENT_DRAFT}}`
- Existing equivalent comment URL, if one already exists: `{{EXISTING_EQUIVALENT_COMMENT_URL_OR_NONE}}`

## Manual QC launch hint

- Expected local launch command family: `{{LOCAL_LAUNCH_COMMAND_FAMILY}}`

## Review-session reminders

- Record the verified bootstrap result for `{{PR_HEAD_SHA}}` here. Do not require the pre-bootstrap checkout to already match it.
- Do not create a worktree.
- Do not post to GitHub.
- Return exactly three outputs:
  1. `{{PR_URL}}`
  2. the full final verdict comment draft for maintainer approval
  3. one exact local command from the current checkout root for manual QC
