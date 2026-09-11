# Candidate triage

Use this policy before recommending a PR for closure, drafting a stale or product-direction comment, or selecting candidates from a review queue. It is the canonical preflight for candidate, closure, and comment decisions. It does not authorize a GitHub write.

## Start with attributable facts

Gather current, account-attributed evidence and record its URL for each item:

- PR author and the contributor's relationship and history with the repository;
- commit authors and co-authors, including verified co-author attribution;
- owner or maintainer implementation participation;
- formal reviews, inline comments, author replies, and linked product decisions;
- current state, draft state, mergeability, commits, checks, and conflicts.

Association labels, display names, and unverified commit trailers do not establish a contributor or maintainer role. Record an unknown role as a gap rather than inferring one.

Do not maintain a permanent people list. Assess contributor and owner context from the PR and repository evidence each time. Frequent or trusted contributors may be waiting for maintainer review. Apply the same care to a new contributor.

Meaningful owner co-authorship or implementation participation establishes product-direction evidence. Distinguish work on the feature from unrelated commits or merges from main. Participation does not approve the code or waive code review. Do not ask an owner whether they want their own feature. Instead, identify any genuinely unsettled scope question.

## Reconstruct the workflow

Read the full current thread before classifying the PR. Record:

- the last concrete request, its URL and date;
- the author's response and changes since that request;
- linked work or product decisions;
- who owes the next action and why;
- the evidence URL for that conclusion.

Choose one workflow state:

1. Awaiting maintainer review or product decision.
2. Awaiting concrete author changes.
3. Draft or work in progress.
4. Author withdrawal or abandonment, supported by evidence.
5. Unknown.

Review delay is not author inactivity. Stable, review-ready work does not need new commits. Draft or WIP status is not abandonment or a reason for generic closure pressure. Treat age, lack of commits, and conflicts as signals to investigate only. No combination of those signals, including age plus conflicts, supports closure by itself.

This evidence gate supersedes mechanical age-plus-conflict closure rules in imported triage guidance. Such rules may identify PRs to investigate, not PRs to close.

For a PR awaiting maintainers, prefer review, pickup, or targeted help. Continue useful technical review when role or workflow facts are incomplete, but hold an unsupported closure or stale-comment recommendation.

## Decide whether closure is supported

Recommend closure only when the record has one independent, evidence-backed reason:

- the work is redundant or superseded by current main;
- an owner has explicitly rejected the proposed direction;
- code review shows a concrete implementation that is unmaintainable or wrong-shaped;
- the author explicitly withdrew it; or
- after a specific unresolved request and documented follow-up, the author has demonstrably abandoned the work.

Ordinary fixable defects are review findings, not grounds to decline. Respect prior owner acceptance and participation. Do not reopen a settled product question.

If the evidence does not support closure, say so. A requested number of candidates is a search target, never a closure quota. Report fewer recommendations rather than treating waiting or maintainer-led work as stale.

## Draft a useful comment

State the actual blocker and the next actor. Preserve the author's credit and name real technical problems. For product direction, ask only the question that remains unsettled after the evidence review.

Before drafting, refresh PR metadata, commits, co-authorship, and thread state. Repeat this check immediately before posting in a separately authorized action. Check top-level comments, formal reviews, and inline reviews for semantic duplicates, author responses, and known removed or withdrawn comments. Follow pagination before claiming no equivalent exists; report unavailable history as a gap. Record an existing equivalent comment URL or that no equivalent exists.

Skip a stale or duplicate approved draft. Explain the changed reason in the review record. This policy does not change review-only limits or authorize posting.

## Recommendation gate

Each closure or comment recommendation must include:

- author, contributor, co-author, and owner context with evidence URLs;
- workflow state, next actor, requested work, response, and date;
- a concrete reason independent of age, conflict, draft status, or commit cadence;
- source URLs for the decision and duplicate check;
- existing-equivalent-comment context; and
- the result of the fresh metadata and thread refresh.

Hold the recommendation when any required fact is missing. Do not fill the gap with a closure assumption.
