#!/usr/bin/env bash
# Ship the current main to www.mylearn.works.  Run from the Mac:  deploy/deploy.sh
#
# Builds LOCALLY (the box has ~1GB spare RAM and other sites on it, so no `next build` there), rsyncs .next, the Inkworks
# content and a bundled task runner, then on the server: pulls code, installs prod deps, applies migrations, imports the
# practice banks, tidies the default admin, and reloads pm2.
#
# data/db/*.sqlite holds live accounts and child profiles: it is NEVER copied from here. The first-ever seed is the
# one-off `deploy/deploy.sh --seed-db` (already done on 1 Oct 2026; do not run it again, it overwrites the live database).
# Secrets live in /var/www/learnworks/.env on the server. CODE_PEPPER is generated there on the first deploy; it must never
# change afterwards or every printed code stops working. ADMIN_EMAIL / ADMIN_PASSWORD are set by the owner on the server.
set -euo pipefail

HOST=root@178.104.147.118   # by IP: only the IP is in known_hosts
DIR=/var/www/learnworks
cd "$(dirname "$0")/.."

[ -z "$(git status --porcelain -- . ':!data/db')" ] || { echo "Uncommitted changes: commit first."; exit 1; }
git push --quiet origin HEAD:main

npm run build
mkdir -p dist
npx esbuild scripts/server-tasks.ts --bundle --platform=node --target=node20 --external:better-sqlite3 --outfile=dist/server-tasks.cjs --log-level=warning --alias:@=./src

ssh "$HOST" "mkdir -p $DIR/.next $DIR/content/inkworks $DIR/dist"
rsync -az --delete .next/ "$HOST:$DIR/.next/"
rsync -az --delete content/inkworks/ "$HOST:$DIR/content/inkworks/"
rsync -az dist/server-tasks.cjs "$HOST:$DIR/dist/server-tasks.cjs"

if [ "${1:-}" = "--seed-db" ]; then
  echo "==> seeding data/db (one time; overwrites the server database)"
  ssh "$HOST" "mkdir -p $DIR/data/db"
  rsync -az --progress data/db/eduworks.sqlite "$HOST:$DIR/data/db/eduworks.sqlite"
fi

ssh "$HOST" "set -e; cd $DIR
  git fetch --quiet origin main && git reset --hard --quiet origin/main
  touch .env && chmod 600 .env
  grep -q '^CODE_PEPPER=' .env || { echo \"CODE_PEPPER=\$(openssl rand -hex 32)\" >> .env; echo '==> generated CODE_PEPPER (keep it forever)'; }
  npm ci --omit=dev --no-audit --no-fund
  set -a; . ./.env; set +a; export NODE_ENV=production
  node dist/server-tasks.cjs migrate
  node dist/server-tasks.cjs import
  node dist/server-tasks.cjs cleanup
  printf '17 3 * * * root cd $DIR && set -a && . ./.env && set +a && NODE_ENV=production node dist/server-tasks.cjs backup >> /var/log/learnworks-backup.log 2>&1\n' > /etc/cron.d/learnworks-backup
  pm2 startOrReload ecosystem.config.cjs --update-env && pm2 save >/dev/null"
echo "==> live: https://www.mylearn.works/"
