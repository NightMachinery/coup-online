#!/usr/bin/env zsh

setopt ERR_EXIT PIPE_FAIL NO_UNSET

ROOT_DIR=$(cd "$(dirname "$0")" && pwd)
DEFAULT_TARGET="${DEFAULT_TARGET:-coup.pinky.lilf.ir}"
NODE_VERSION="${NODE_VERSION:-20.20.0}"
SERVER_PORT="${SERVER_PORT:-8008}"
CLIENT_PORT="${CLIENT_PORT:-4273}"
SERVER_ENV_FILE="$ROOT_DIR/server/.env.self-hosted.local"
CLIENT_ENV_FILE="$ROOT_DIR/client/.env.self-hosted.local"
CADDYFILE_PATH="${CADDYFILE_PATH:-$HOME/Caddyfile}"
SESSION_SERVER="coup-online-server"
SESSION_CLIENT="coup-online-client"
MANAGED_BLOCK_BEGIN="# BEGIN coup-online self-host"
MANAGED_BLOCK_END="# END coup-online self-host"

PUBLIC_URL=""
CADDY_SITE_LABEL=""
PUBLIC_HOST=""

tmuxnew () {
  local session="$1"
  shift

  tmux kill-session -t "$session" &>/dev/null || true
  tmux new-session -d -s "$session" "$@"
}

tmuxnew_with_env() {
  local session="$1"
  shift
  local command="$1"
  shift
  local -a tmux_args=(-d -s "$session")
  local env_assignment

  for env_assignment in "$@"; do
    tmux_args+=(-e "$env_assignment")
  done

  tmux kill-session -t "$session" &>/dev/null || true
  tmux new-session "${tmux_args[@]}" "$command"
}

say() {
  print -r -- "$@"
}

die() {
  print -u2 -r -- "$@"
  exit 1
}

use_proxy() {
  export ALL_PROXY=http://127.0.0.1:9087 all_proxy=http://127.0.0.1:9087 http_proxy=http://127.0.0.1:9087 https_proxy=http://127.0.0.1:9087 HTTP_PROXY=http://127.0.0.1:9087 HTTPS_PROXY=http://127.0.0.1:9087 npm_config_proxy=http://127.0.0.1:9087 npm_config_https_proxy=http://127.0.0.1:9087
  export NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost
}

load_node() {
  nvm-load
  nvm use "$NODE_VERSION"
}

normalize_target() {
  local raw="${1:-$DEFAULT_TARGET}"
  raw="${raw%%/}"

  case "$raw" in
    http://*)
      local http_host="${raw#http://}"
      http_host="${http_host%%/*}"
      PUBLIC_URL="http://$http_host"
      CADDY_SITE_LABEL="$PUBLIC_URL"
      ;;
    https://*)
      local https_host="${raw#https://}"
      https_host="${https_host%%/*}"
      PUBLIC_URL="https://$https_host"
      CADDY_SITE_LABEL="$PUBLIC_URL"
      ;;
    *)
      raw="${raw%%/*}"
      PUBLIC_URL="http://$raw"
      CADDY_SITE_LABEL="$PUBLIC_URL"
      ;;
  esac

  if [[ "$PUBLIC_URL" == http://* ]]; then
    PUBLIC_HOST="${PUBLIC_URL#http://}"
  else
    PUBLIC_HOST="${PUBLIC_URL#https://}"
  fi
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

install_apt_packages_if_missing() {
  local missing=()
  command -v tmux >/dev/null 2>&1 || missing+=(tmux)
  command -v caddy >/dev/null 2>&1 || missing+=(caddy)
  command -v redis-server >/dev/null 2>&1 || missing+=(redis-server)
  command -v redis-cli >/dev/null 2>&1 || missing+=(redis-tools)

  (( ${#missing[@]} == 0 )) && return 0

  command -v apt-get >/dev/null 2>&1 || die "Missing packages: ${missing[*]}. Install them manually and rerun."
  command -v sudo >/dev/null 2>&1 || die "sudo is required to install missing packages: ${missing[*]}"

  say "Installing missing packages: ${missing[*]}"
  sudo apt-get update
  sudo apt-get install -y ${missing[*]}
}

ensure_redis_running() {
  if redis-cli ping >/dev/null 2>&1; then
    return 0
  fi

  if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl enable --now redis-server || true
  fi

  redis-cli ping >/dev/null 2>&1 || die "Redis is not responding on 127.0.0.1:6379"
}

ensure_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    return 0
  fi

  if command -v corepack >/dev/null 2>&1; then
    corepack enable
    corepack prepare pnpm@9 --activate
  else
    npm install -g pnpm@9
  fi

  command -v pnpm >/dev/null 2>&1 || die "Unable to install pnpm"
}

write_env_files() {
  mkdir -p "$ROOT_DIR/server" "$ROOT_DIR/client"

  cat > "$SERVER_ENV_FILE" <<EOF_SERVER
EXPRESS_PORT=$SERVER_PORT
REDIS_CONNECTION_STRING=redis://127.0.0.1:6379
EOF_SERVER

  cat > "$CLIENT_ENV_FILE" <<EOF_CLIENT
VITE_API_BASE_URL=$PUBLIC_URL
VITE_SOCKET_SERVER_URL=$PUBLIC_URL
VITE_SOCKET_SERVER_PATH=/socket.io
VITE_AUTH_MODE=local
VITE_PUBLIC_URL=$PUBLIC_URL
EOF_CLIENT
}

build_app() {
  use_proxy
  load_node
  ensure_pnpm

  (
    cd "$ROOT_DIR/shared"
    pnpm install --frozen-lockfile
    pnpm build
  )

  (
    cd "$ROOT_DIR/server"
    pnpm install --frozen-lockfile
    pnpm build
  )

  (
    cd "$ROOT_DIR/client"
    CYPRESS_INSTALL_BINARY=0 pnpm install --frozen-lockfile
    pnpm build --mode self-hosted
  )
}

update_caddyfile() {
  local managed_block
  managed_block=$(cat <<EOF_BLOCK
$MANAGED_BLOCK_BEGIN
$CADDY_SITE_LABEL {
	encode zstd gzip

	@coup_backend {
		path /api/* /socket.io*
	}

	handle @coup_backend {
		reverse_proxy 127.0.0.1:$SERVER_PORT
	}

	handle {
		reverse_proxy 127.0.0.1:$CLIENT_PORT
	}
}
$MANAGED_BLOCK_END
EOF_BLOCK
)

  python3 - "$CADDYFILE_PATH" "$MANAGED_BLOCK_BEGIN" "$MANAGED_BLOCK_END" "$managed_block" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1]).expanduser()
begin = sys.argv[2]
end = sys.argv[3]
block = sys.argv[4]

text = path.read_text() if path.exists() else ""
start = text.find(begin)
finish = text.find(end)
if start != -1 and finish != -1 and finish > start:
    finish += len(end)
    new_text = text[:start].rstrip() + "\n\n" + block + "\n"
    if finish < len(text):
        remainder = text[finish:].lstrip("\n")
        if remainder:
            new_text += "\n" + remainder
else:
    new_text = text.rstrip()
    if new_text:
        new_text += "\n\n"
    new_text += block + "\n"
path.write_text(new_text)
PY
}

reload_caddy() {
  caddy validate --config "$CADDYFILE_PATH" --adapter caddyfile
  if ! caddy reload --config "$CADDYFILE_PATH" --adapter caddyfile; then
    if command -v systemctl >/dev/null 2>&1; then
      sudo systemctl reload caddy
    else
      die "Unable to reload Caddy automatically"
    fi
  fi
}

ensure_artifacts_exist() {
  [[ -f "$ROOT_DIR/server/dist/server/index.js" ]] || die "Missing server build output. Run ./self_host.zsh setup first."
  [[ -f "$ROOT_DIR/client/build/index.html" ]] || die "Missing client build output. Run ./self_host.zsh setup first."
  [[ -f "$SERVER_ENV_FILE" ]] || die "Missing $SERVER_ENV_FILE. Run ./self_host.zsh setup first."
  [[ -f "$CLIENT_ENV_FILE" ]] || die "Missing $CLIENT_ENV_FILE. Run ./self_host.zsh setup first."
}

run_setup() {
  normalize_target "${1:-$DEFAULT_TARGET}"
  install_apt_packages_if_missing
  ensure_redis_running
  write_env_files
  build_app
  update_caddyfile
  reload_caddy
  say "Prepared self-hosted Coup Online for $PUBLIC_URL"
}

run_start() {
  local target_override="${1:-}"

  if [[ -n "$target_override" || ! -f "$SERVER_ENV_FILE" || ! -f "$CLIENT_ENV_FILE" || ! -f "$ROOT_DIR/server/dist/server/index.js" || ! -f "$ROOT_DIR/client/build/index.html" ]]; then
    run_setup "${target_override:-$DEFAULT_TARGET}"
  fi

  ensure_artifacts_exist
  ensure_redis_running
  load_node
  need_cmd tmux

  local server_cmd
  local client_cmd
  server_cmd="cd ${(q)ROOT_DIR}/server; set -a; source ${(q)SERVER_ENV_FILE}; set +a; nvm-load; nvm use ${(q)NODE_VERSION}; node dist/server/index.js"
  client_cmd="cd ${(q)ROOT_DIR}/client; nvm-load; nvm use ${(q)NODE_VERSION}; pnpm preview --host 127.0.0.1 --port ${(q)CLIENT_PORT}"

  tmuxnew_with_env "$SESSION_SERVER" "zsh -lc ${(q)server_cmd}" \
    "ALL_PROXY=http://127.0.0.1:9087" \
    "all_proxy=http://127.0.0.1:9087" \
    "http_proxy=http://127.0.0.1:9087" \
    "https_proxy=http://127.0.0.1:9087" \
    "HTTP_PROXY=http://127.0.0.1:9087" \
    "HTTPS_PROXY=http://127.0.0.1:9087" \
    "npm_config_proxy=http://127.0.0.1:9087" \
    "npm_config_https_proxy=http://127.0.0.1:9087" \
    "NO_PROXY=127.0.0.1,localhost" \
    "no_proxy=127.0.0.1,localhost"
  tmuxnew_with_env "$SESSION_CLIENT" "zsh -lc ${(q)client_cmd}" \
    "ALL_PROXY=http://127.0.0.1:9087" \
    "all_proxy=http://127.0.0.1:9087" \
    "http_proxy=http://127.0.0.1:9087" \
    "https_proxy=http://127.0.0.1:9087" \
    "HTTP_PROXY=http://127.0.0.1:9087" \
    "HTTPS_PROXY=http://127.0.0.1:9087" \
    "npm_config_proxy=http://127.0.0.1:9087" \
    "npm_config_https_proxy=http://127.0.0.1:9087" \
    "NO_PROXY=127.0.0.1,localhost" \
    "no_proxy=127.0.0.1,localhost"

  say "Started tmux sessions: $SESSION_SERVER, $SESSION_CLIENT"
}

run_stop() {
  tmux kill-session -t "$SESSION_SERVER" &> /dev/null || true
  tmux kill-session -t "$SESSION_CLIENT" &> /dev/null || true
  say "Stopped tmux sessions."
}

main() {
  cd "$ROOT_DIR"

  local command="${1:-}"
  local target="${2:-}"

  case "$command" in
    setup)
      run_setup "${target:-$DEFAULT_TARGET}"
      ;;
    start)
      run_start "$target"
      ;;
    stop)
      run_stop
      ;;
    *)
      die "Usage: ./self_host.zsh [setup|start|stop] [url-or-host]"
      ;;
  esac
}

main "$@"
