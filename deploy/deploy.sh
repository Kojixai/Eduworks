#!/usr/bin/env bash
# Ship the current main to www.mylearn.works.  Run from the Mac:  deploy/deploy.sh
#
# Builds LOCALLY (the box has ~1GB spare RAM and other sites on it, so no `next build` there),
# rsyncs .next, then pulls code + installs prod deps + reloads pm2 on the server.
# data/db/*.sqlite holds live accounts and child profiles: it is NEVER synced from here.
# First-time seeding is a separate, deliberate step: deploy/deploy.sh --seed-db
set -euo pipefail

HOST=root@178.104.147.118   # by IP: only the IP is in known_hosts
DIR=/var/www/learnworks
cd "$(dirname "$0")/.."

[ -z "$(git status --porcelain -- . ':!data/db')" ] || { echo "Uncommitted changes: commit and push first."; exit 1; }
git push --quiet origin main

npm run build
rsync -az --delete .next/ "$HOST:$DIR/.next/"

if [ "${1:-}" = "--seed-db" ]; then
  echo "==> seeding data/db (one time; overwrites the server database)"
  ssh "$HOST" "mkdir -p $DIR/data/db"
  rsync -az --progress data/db/eduworks.sqlite "$HOST:$DIR/data/db/eduworks.sqlite"
fi

ssh "$HOST" "set -e; cd $DIR
  git fetch --quiet origin main && git reset --hard --quiet origin/main
  npm ci --omit=dev --no-audit --no-fund
  pm2 startOrReload ecosystem.config.cjs --update-env && pm2 save >/dev/null"
echo "==> live: https://www.mylearn.works/"
