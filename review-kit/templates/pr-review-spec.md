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
- Reviewed checkout HEAD SHA: `{{REVIEWED_CHECKOUT_HEAD_SHA}}`
- Current remote PR HEAD SHA: `{{PR_HEAD_SHA}}`

## Candidate triage record

Read [`CANDIDATE_TRIAGE.md`](../CANDIDATE_TRIAGE.md) before completing this record. Record an unknown role or workflow state with the sources checked; it holds an unsupported closure recommendation, not useful technical review. If no closure or comment is proposed, mark that reason field not applicable and explain why.

- Author and contributor relationship/history evidence: `{{AUTHOR_CONTRIBUTOR_CONTEXT_WITH_URLS}}`
- Commit-author and co-author evidence: `{{COMMIT_AUTHOR_COAUTHOR_CONTEXT_WITH_URLS}}`
- Owner or maintainer implementation participation and product-decision evidence: `{{OWNER_PARTICIPATION_AND_DECISION_CONTEXT_WITH_URLS}}`
- Next-action responsibility and workflow state: `{{NEXT_ACTOR_AND_WORKFLOW_STATE}}`
- Last concrete request, author response, changes since, and dated evidence: `{{REQUEST_RESPONSE_AND_FOLLOW_UP_WITH_URLS}}`
- Closure or comment reason independent of age, conflicts, draft status, and commit cadence: `{{EVIDENCE_BACKED_REASON_OR_HOLD}}`
- Decision sources: `{{TRIAGE_DECISION_SOURCE_URLS}}`
- Existing-equivalent-comment, formal-review, and inline-comment context: `{{EXISTING_EQUIVALENT_COMMENT_CONTEXT_WITH_URLS_OR_NONE}}`
- Fresh metadata and semantic-duplicate check result: `{{FRESHNESS_AND_DUPLICATE_CHECK_RESULT}}`

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
- Existing equivalent comment URL, if one already exists: record it in the candidate triage record.

## Manual QC launch hint

- Expected local launch command family: `{{LOCAL_LAUNCH_COMMAND_FAMILY}}`

## Review-session reminders

- Review the recorded checkout SHA `{{REVIEWED_CHECKOUT_HEAD_SHA}}`; treat the remote PR-head SHA `{{PR_HEAD_SHA}}` as freshness context.
- Do not create a worktree.
- Do not post to GitHub.
- Return exactly three outputs:
  1. `{{PR_URL}}`
  2. the full final verdict comment draft for maintainer approval
  3. one exact local command from the current checkout root for manual QC
