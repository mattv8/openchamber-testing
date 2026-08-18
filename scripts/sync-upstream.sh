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
upstream_url=$(git -C "$source_dir" remote get-url upstream 2>/dev/null || true)

[ "$origin_url" = "https://github.com/mattv8/openchamber.git" ] || die "Unexpected origin fetch URL: ${origin_url:-<missing>}"
[ "$upstream_url" = "https://github.com/openchamber/openchamber.git" ] || die "Unexpected upstream fetch URL: ${upstream_url:-<missing>}"

require_clean_worktree() {
  if [ -n "$(git -C "$source_dir" status --porcelain --untracked-files=all)" ]; then
    die "Source repository must be clean, including untracked files."
  fi
}

fetch_full_remote() {
  remote_name=$1
  remote_refspec=$2

  if [ "$(git -C "$source_dir" rev-parse --is-shallow-repository)" = "true" ]; then
    git -C "$source_dir" fetch --prune --tags --unshallow "$remote_name" "$remote_refspec"
  else
    git -C "$source_dir" fetch --prune --tags "$remote_name" "$remote_refspec"
  fi
}

require_clean_worktree

fetch_full_remote origin '+refs/heads/*:refs/remotes/origin/*'
fetch_full_remote upstream '+refs/heads/*:refs/remotes/upstream/*'

git -C "$source_dir" rev-parse --verify refs/remotes/origin/main >/dev/null 2>&1 || die "Missing origin/main after fetch."
git -C "$source_dir" rev-parse --verify refs/remotes/upstream/main >/dev/null 2>&1 || die "Missing upstream/main after fetch."

if ! git -C "$source_dir" merge-base --is-ancestor refs/remotes/origin/main refs/remotes/upstream/main; then
  die "origin/main is not an ancestor of upstream/main; refusing to update."
fi

git -C "$source_dir" switch main
git -C "$source_dir" branch --set-upstream-to=upstream/main main >/dev/null
git -C "$source_dir" merge --ff-only refs/remotes/upstream/main
git -C "$source_dir" push origin main:main

printf '%s\n' 'openchamber-custom was intentionally untouched.'
