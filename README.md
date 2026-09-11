# OpenChamber custom release orchestration

> [!WARNING]
> Builds from this repository are unsigned macOS arm64 DMGs only. They keep the official `openchamber/openchamber` updater. If the packaged app installs an official update, that update can replace the custom build and remove custom behavior.

This repository is the public orchestration repo for a plain parent directory that contains two independent sibling clones:

```text
~/GitRepos/openchamber/
├── openchamber/          # source clone
└── openchamber-testing/  # this orchestration repo
```

`openchamber-testing/` contains release orchestration and documentation only. It does **not** contain OpenChamber application source, a submodule, a source copy, or a patch overlay.

CI accepts `source_ref` values only from `mattv8/openchamber`. It does not build from arbitrary repositories.

## Source clone remotes

The sibling `../openchamber` clone is expected to use these exact remotes:

```sh
git -C ../openchamber remote -v
```

Expected output:

```text
origin   https://github.com/mattv8/openchamber.git (fetch)
origin   https://github.com/mattv8/openchamber.git (push)
upstream https://github.com/openchamber/openchamber.git (fetch)
upstream DISABLED (push)
```

- `origin` is your fork and is the only normal push target.
- `upstream` is the official repository and is fetch-only.
- Local config should also set `remote.pushDefault=origin` and block upstream pushes before GitHub is contacted.

## Branch model

- `main` tracks `upstream/main`.
- `openchamber-custom` tracks `origin/openchamber-custom`.
- Feature branches push to `origin`.
- Upstream contribution happens from a pushed fork branch into `openchamber/openchamber`.
- Custom releases are merged selectively into `openchamber-custom`.

Check the current state:

```sh
git -C ../openchamber branch -vv
```

## Reviewer kit

Start a new chat from a manually prepared, clean checkout. The fenced blocks below are prose you paste into chat, not shell commands.

Use the generic kickoff when the checkout already makes the live PR obvious:

```text
Read /Users/elfy/GitRepos/openchamber-testing/review-kit/REVIEW_PROTOCOL.md and begin in discovery mode for this checkout.
```

Use the explicit override when discovery would infer zero PRs or more than one PR:

```text
Read /Users/elfy/GitRepos/openchamber-testing/review-kit/REVIEW_PROTOCOL.md and begin in discovery mode for PR #3227 in this checkout.
```

Discovery verifies the live PR, records and reviews the prepared checkout HEAD, writes `/Users/elfy/GitRepos/openchamber-testing/.scratch/pr-reviews/live/pr-<number>.md`, then switches to review-only mode. Immediately before the verdict, the reviewer refreshes metadata and fetches the PR head to report drift without switching the checkout or stopping because the PR is conflicting. The protocol creates no worktree and makes no GitHub write.

The review kickoff should produce exactly three outputs: a clickable PR link, a complete final verdict comment draft, and one exact local QC command.

Before finding closure candidates or commenting on staleness or product direction, read and follow [`review-kit/CANDIDATE_TRIAGE.md`](review-kit/CANDIDATE_TRIAGE.md). It requires evidence for authorship, contributor context, workflow state, and duplicate comments before a recommendation is made.

Run the focused contract test when you change the review protocol:

```sh
node --test review-kit/tests/review-protocol.test.mjs
```

Run the full review-kit suite when you need the broader check:

```sh
node --test review-kit/tests/prepare-pr-review.test.mjs review-kit/tests/pr-qc.test.mjs review-kit/tests/review-protocol.test.mjs
```

## Common commands

### Sync `main` safely

Use the guarded helper instead of an ad-hoc pull when you want local `main` and `origin/main` fast-forwarded to `upstream/main`:

```sh
./scripts/sync-upstream.sh
```

That helper never changes `openchamber-custom`.

### Switch between the main branches

```sh
git -C ../openchamber switch main

git -C ../openchamber switch openchamber-custom
git -C ../openchamber pull --ff-only origin openchamber-custom
```

### Create and push an upstream-oriented feature branch

Start upstream contribution branches from synchronized local `main`, not from `openchamber-custom`.

```sh
branch="feature/my-change"
./scripts/sync-upstream.sh
git -C ../openchamber switch main
git -C ../openchamber switch -c "$branch"
# make and commit your changes in ../openchamber
git -C ../openchamber push -u origin "$branch"
```

You can test that pushed upstream-oriented branch directly, open an upstream PR from it, and merge it into `openchamber-custom` later if you want the same work in the custom release branch.

### Test one pushed upstream-oriented feature branch without merging it

The branch must already be pushed to `mattv8/openchamber`.

```sh
branch="feature/my-change"
gh workflow run build-release.yml \
  --repo mattv8/openchamber-testing \
  --ref main \
  -f "source_ref=$branch"
```

### Open an upstream pull request with GitHub CLI

```sh
branch="feature/my-change"
gh pr create \
  --repo openchamber/openchamber \
  --head "mattv8:$branch" \
  --base main
```

### Merge selected upstream-oriented work into `openchamber-custom`

Do this explicitly. Nothing in this repository should merge into `openchamber-custom` automatically.

```sh
branch="feature/my-change"
git -C ../openchamber switch openchamber-custom
git -C ../openchamber pull --ff-only origin openchamber-custom
git -C ../openchamber merge --no-ff "$branch"
git -C ../openchamber push origin openchamber-custom
```

### Create and push a custom-only feature branch

Use this flow for work that is meant for `openchamber-custom` and is not being prepared as an upstream PR branch.

```sh
branch="custom/my-change"
git -C ../openchamber switch openchamber-custom
git -C ../openchamber pull --ff-only origin openchamber-custom
git -C ../openchamber switch -c "$branch"
# make and commit your changes in ../openchamber
git -C ../openchamber push -u origin "$branch"
```

### Test one pushed custom-only feature branch without merging it

The branch must already be pushed to `mattv8/openchamber`.

```sh
branch="custom/my-change"
gh workflow run build-release.yml \
  --repo mattv8/openchamber-testing \
  --ref main \
  -f "source_ref=$branch"
```

### Dispatch the canonical custom build

```sh
gh workflow run build-release.yml \
  --repo mattv8/openchamber-testing \
  --ref main \
  -f "source_ref=openchamber-custom"
```

### List build runs

```sh
gh run list \
  --repo mattv8/openchamber-testing \
  --workflow build-release.yml
```

### Download the latest prerelease DMG

```sh
tag=$(gh release list --repo mattv8/openchamber-testing --limit 1 --json tagName --jq '.[0].tagName')
[ -n "$tag" ] || { printf '%s\n' 'No release tag found.' >&2; exit 1; }
mkdir -p downloads
gh release download \
  --repo mattv8/openchamber-testing \
  "$tag" \
  --pattern "*.dmg" \
  --dir downloads
```

## Helper scripts

This repository provides these helpers:

### `scripts/sync-upstream.sh`

- operates on the sibling source clone at `../openchamber` by default;
- verifies the expected `origin` and `upstream` remotes;
- requires a clean source working tree;
- fast-forwards `main` to `upstream/main` and pushes that fast-forward to `origin/main`;
- never changes `openchamber-custom`.

Run it from this repository root:

```sh
./scripts/sync-upstream.sh
```

### `scripts/build-current-ref.sh`

- operates on the sibling source clone at `../openchamber` by default;
- requires a named current branch;
- requires local `HEAD` to match `origin/<branch>` so CI always builds pushed code;
- dispatches `build-release.yml` in `mattv8/openchamber-testing` with `source_ref=<current-branch>`;
- prints the Actions URL after a successful dispatch.

Run it from this repository root:

```sh
./scripts/build-current-ref.sh
```

## Manual GitHub UI dispatch

Open `https://github.com/mattv8/openchamber-testing/actions`, select the manual workflow defined by `.github/workflows/build-release.yml`, click **Run workflow**, and leave `source_ref` at its default `openchamber-custom` unless you want to test another already-pushed ref from `mattv8/openchamber`.

## Automatic custom releases

`.github/workflows/watch-custom-release.yml` checks `mattv8/openchamber:openchamber-custom` every 15 minutes and also supports manual dispatch from the Actions tab. It skips builds when the current 40-character source SHA already appears in prerelease provenance as the generated `Source commit:` line.

Rapid pushes can collapse into one build for the newest unreleased SHA because the watcher never cancels an in-progress automatic run. Manual dispatch of `build-release.yml` still works when you want to force or test a specific pushed ref from `mattv8/openchamber`.

## Build and release behavior

- GitHub Actions runs in `mattv8/openchamber-testing`.
- Prereleases and downloadable DMGs also appear in `mattv8/openchamber-testing`.
- Every release identifies the exact source SHA that produced it.
- No Apple signing or notarization secrets are required for this unsigned build path.
- The bundled OpenCode CLI is downloaded from official `anomalyco/opencode` GitHub releases matching the source tree's pinned SDK version.

The initial canonical build completed in [run 32188205971](https://github.com/mattv8/openchamber-testing/actions/runs/32188205971) and published [custom-v1.18.4-build.1.1](https://github.com/mattv8/openchamber-testing/releases/tag/custom-v1.18.4-build.1.1).

## Unsigned macOS warning

Only use a downloaded DMG if you personally trust its source and the recorded provenance SHA.

GitHub Actions artifacts are always downloaded as ZIP archives. To download the DMG without a ZIP wrapper, open the latest prerelease and download its `.dmg` asset directly.

After downloading the trusted DMG, remove quarantine before opening it:

```sh
xattr -dr com.apple.quarantine "/path/to/OpenChamber-<version>-custom-<sha>-mac-arm64.dmg"
open "/path/to/OpenChamber-<version>-custom-<sha>-mac-arm64.dmg"
```

Copy `OpenChamber.app` to `/Applications`. If macOS still retains quarantine on the copied app, remove it:

```sh
xattr -dr com.apple.quarantine "/Applications/OpenChamber.app"
```

These commands remove Gatekeeper quarantine on your machine. They do **not** make unsigned software generally safe.
