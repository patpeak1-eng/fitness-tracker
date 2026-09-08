#!/usr/bin/env bash
# Poll Railway until both fitness services report the given commit as SUCCESS.
# Usage: poll_deploy.sh <sha> [max_polls]
# See docs/skills/railway-deploy-verification.md — this is the CLI ground-truth
# check; --service is mandatory (an unqualified command targets the wrong service).
set -u
SHA="${1:?usage: poll_deploy.sh <sha> [max_polls]}"
MAX="${2:-10}"

check() { # service -> prints "STATUS hash"
  railway deployment list --service "$1" --limit 1 --json 2>/dev/null \
    | tr -d ' \n' \
    | sed -n 's/.*"status":"\([A-Z]*\)".*"commitHash":"\([0-9a-f]*\)".*/\1 \2/p'
}

for i in $(seq 1 "$MAX"); do
  fe=$(check "fitness-tracker"); be=$(check "Fitness Tracker Backend")
  echo "[poll $i/$MAX] frontend: ${fe:-no-data} | backend: ${be:-no-data}"

  case "$fe $be" in
    *FAILED*|*CRASHED*) echo "RESULT: FAILED — a deploy did not succeed"; exit 1;;
  esac

  fe_status="${fe%% *}"; fe_hash="${fe##* }"
  be_status="${be%% *}"; be_hash="${be##* }"
  # ${hash#$SHA} differs from $hash only when $hash starts with $SHA
  if [ "$fe_status" = "SUCCESS" ] && [ "$be_status" = "SUCCESS" ] \
     && [ "${fe_hash#$SHA}" != "$fe_hash" ] \
     && [ "${be_hash#$SHA}" != "$be_hash" ]; then
    echo "RESULT: BOTH SUCCESS at $SHA"; exit 0
  fi
  [ "$i" -lt "$MAX" ] && sleep 30
done
echo "RESULT: TIMEOUT — still not SUCCESS at $SHA after $MAX polls"; exit 2
