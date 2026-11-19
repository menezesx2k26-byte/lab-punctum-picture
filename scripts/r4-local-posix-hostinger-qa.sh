#!/usr/bin/env bash
# Reproducible, strictly local Linux validation of the Node Hostinger candidate.
# Does not connect to any Hostinger account or use production data.
set -euo pipefail
umask 077

source_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
target_root="$(mktemp -d "${HOME}/punctum-r4-local-posix-qa.XXXXXXXX")"
printf 'SYNTHETIC_POSIX_QA_DIR=%s\n' "$target_root"

# Ignore live repository, generated bundles, private config, downloaded files.
rsync -a \
  --exclude '/.git' \
  --exclude '/node_modules' \
  --exclude '/dist' \
  --exclude '/.next' \
  --exclude '/.wrangler' \
  --exclude '/.env*' \
  --exclude '/linux-node-test-results.log' \
  "$source_root/" "$target_root/"

cd "$target_root"
printf 'SYNTHETIC_POSIX_QA_NODE=%s\n' "$(node --version)"
npm ci --no-audit --no-fund
set +e
node --test services/punctum-hostinger-production/*.test.mjs scripts/hostinger-clerk-production-proof.test.mjs > linux-node-test-results.log 2>&1
result=$?
set -e
tail -n 38 linux-node-test-results.log
printf 'SYNTHETIC_POSIX_QA_EXIT=%s\n' "$result"
exit "$result"
