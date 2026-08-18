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

## Build and release behavior

- GitHub Actions runs in `mattv8/openchamber-testing`.
- Prereleases and downloadable DMGs also appear in `mattv8/openchamber-testing`.
- Every release should identify the exact source SHA that produced it.
- No Apple signing or notarization secrets are required for this unsigned build path.
- The bundled OpenCode CLI is downloaded from official `anomalyco/opencode` GitHub releases matching the source tree's pinned SDK version.

No successful build is claimed here yet.

## Unsigned macOS warning

Only use a downloaded DMG if you personally trust its source and the recorded provenance SHA.

For a personally trusted downloaded DMG, macOS may block the first launch because the app is unsigned. Typical local removal of the quarantine attribute is:

```sh
xattr -dr com.apple.quarantine "/Applications/OpenChamber.app"
```

That command removes Gatekeeper quarantine from the installed app on your machine. It does **not** make unsigned software generally safe.
