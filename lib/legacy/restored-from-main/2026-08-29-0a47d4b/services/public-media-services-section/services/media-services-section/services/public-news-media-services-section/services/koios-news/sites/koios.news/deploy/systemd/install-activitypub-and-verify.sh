#!/usr/bin/env bash
# Verify and install the retained-ingress unit only. Never enables or starts it.
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
service_root=${KOIOS_ACTIVITYPUB_SERVICE_ROOT:-"$HOME/services/activitypub-retained-inbox-provider"}
environment_file=${KOIOS_ACTIVITYPUB_ENVIRONMENT_FILE:-"$HOME/.config/emsenn/koios-activitypub.env"}
unit_dir=${XDG_CONFIG_HOME:-"$HOME/.config"}/systemd/user
unit=bare-cedar-fog-koios-activitypub.service

failures=0
require_file() {
  local label=$1 path=$2
  if [[ -f "$path" && ! -L "$path" ]]; then printf 'ok      %s: %s\n' "$label" "$path"
  else printf 'missing or unsafe %s: %s\n' "$label" "$path" >&2; failures=$((failures + 1)); fi
}
require_private_file() {
  local label=$1 path=$2 mode
  require_file "$label" "$path"
  if [[ -f "$path" ]]; then
    mode=$(stat -c '%a' "$path")
    if (( (8#$mode & 8#077) != 0 )); then printf 'unsafe mode %s for %s: %s\n' "$mode" "$label" "$path" >&2; failures=$((failures + 1)); fi
  fi
}

require_file 'provider package' "$service_root/package.json"
require_file 'provider entrypoint' "$service_root/src/server.mjs"
require_file 'ActivityPub provider dependency' "$service_root/node_modules/@red-cup-engineering/activitypub-provider-service/package.json"
require_file 'ActivityPub SQLite dependency' "$service_root/node_modules/@red-cup-engineering/activitypub-services-section/package.json"
require_private_file 'deployment environment' "$environment_file"

key_path=''
token_path=''
if [[ -f "$environment_file" ]]; then
  while IFS='=' read -r name value; do
    [[ -z "$name" || "$name" == \#* ]] && continue
    case "$name" in
      ACTIVITYPUB_KEYS_PATH) key_path=$value ;;
      ACTIVITYPUB_INBOX_BEARER_TOKEN_FILE) token_path=$value ;;
      *) printf 'unsupported ActivityPub environment field: %s\n' "$name" >&2; failures=$((failures + 1)) ;;
    esac
  done < "$environment_file"
fi
[[ "$key_path" == /* ]] || { printf 'ACTIVITYPUB_KEYS_PATH must be absolute\n' >&2; failures=$((failures + 1)); }
[[ "$token_path" == /* ]] || { printf 'ACTIVITYPUB_INBOX_BEARER_TOKEN_FILE must be absolute\n' >&2; failures=$((failures + 1)); }
[[ -z "$key_path" ]] || require_private_file 'actor key material' "$key_path"
[[ -z "$token_path" ]] || require_private_file 'inbox bearer token' "$token_path"

(cd "$service_root" && node --input-type=module --eval \
  'await import("./src/server.mjs"); await import("@red-cup-engineering/activitypub-services-section/sqlite-runtime");') \
  2>/dev/null || { printf 'provider ESM closure is not importable\n' >&2; failures=$((failures + 1)); }
systemd-analyze --user verify "$script_dir/$unit"

if (( failures > 0 )); then
  printf 'Koios ActivityPub preflight refused with %d unresolved requirement(s).\n' "$failures" >&2
  exit 1
fi

if [[ ${1:-} == --install ]]; then
  if systemctl --user is-enabled --quiet "$unit"; then
    printf 'refusing to replace enabled unit: %s\n' "$unit" >&2
    exit 2
  fi
  install -d -m 0755 "$unit_dir"
  install -m 0644 "$script_dir/$unit" "$unit_dir/$unit"
  systemctl --user daemon-reload
  printf 'Installed Koios ActivityPub unit without enabling or starting it.\n'
elif [[ $# -ne 0 ]]; then
  printf 'usage: %s [--install]\n' "$0" >&2
  exit 64
else
  printf 'Koios ActivityPub preflight passed; rerun with --install to install disabled.\n'
fi
