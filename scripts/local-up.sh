#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/local-env.mjs
chmod 644 infra/init.sql infra/kong.yml
docker compose --env-file .data/compose.env up -d --wait --wait-timeout 60
for i in $(seq 1 60); do
 if curl --fail --silent http://127.0.0.1:54321/auth/v1/health >/dev/null && curl --fail --silent http://127.0.0.1:54321/storage/v1/status >/dev/null; then break; fi
 if [[ "$i" == 60 ]]; then echo 'Supabase services did not become ready. Inspect docker compose logs.' >&2; exit 1; fi
 sleep 1
done
npm run db:setup
npm run seed
printf 'Local PostgreSQL, Supabase Auth and private Storage ready. Run npm run dev.\n'
