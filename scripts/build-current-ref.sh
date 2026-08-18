#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
source_dir=${OPENCHAMBER_SOURCE_DIR:-$script_dir/../../openchamber}

die() {
  printf '%s\n' "$*" >&2
  exit 1
}

if ! [ -d "$source_dir" ]; then
  die "Source directory not found: $source_dir"
fi

if ! git -C "$source_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  die "Source directory is not a Git worktree: $source_dir"
fi

if [ "$(git -C "$source_dir" rev-parse --is-inside-work-tree)" != "true" ]; then
  die "Source directory is not a Git worktree: $source_dir"
fi

origin_url=$(git -C "$source_dir" remote get-url origin 2>/dev/null || true)
[ "$origin_url" = "https://github.com/mattv8/openchamber.git" ] || die "Unexpected origin fetch URL: ${origin_url:-<missing>}"

branch=$(git -C "$source_dir" branch --show-current)
[ -n "$branch" ] || die 'Detached HEAD is not supported; check out a branch first.'

git -C "$source_dir" fetch --prune --tags origin '+refs/heads/*:refs/remotes/origin/*'

remote_ref=refs/remotes/origin/$branch
git -C "$source_dir" rev-parse --verify "$remote_ref" >/dev/null 2>&1 || die "Missing origin/$branch after fetch."

local_head=$(git -C "$source_dir" rev-parse HEAD)
remote_head=$(git -C "$source_dir" rev-parse "$remote_ref")

[ "$local_head" = "$remote_head" ] || die "Local HEAD does not match origin/$branch; push or reset before dispatching."

gh auth status >/dev/null 2>&1 || die 'GitHub CLI is not authenticated.'

gh workflow run build-release.yml \
  --repo mattv8/openchamber-testing \
  --ref main \
  -f "source_ref=$branch"

printf '%s\n' 'Workflow dispatched: https://github.com/mattv8/openchamber-testing/actions'
