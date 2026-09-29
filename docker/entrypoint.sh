#!/bin/sh
# Container entrypoint: prepare state, reach host-side AI providers, then start
# the server as an unprivileged uid.
set -eu

PORT="${OPENFOX_PORT:-10369}"
RUN_UID="${OPENFOX_UID:-1000}"
RUN_GID="${OPENFOX_GID:-1000}"
CONFIG_DIR="${XDG_CONFIG_HOME:-/data}/openfox"
DATA_DIR="${XDG_DATA_HOME:-/data}/openfox"

log() { echo "[openfox] $*" >&2; }

# Started as root: fix ownership of the state directories, then drop privileges.
# Started with `user:` set (already unprivileged): nothing to fix, nothing to drop.
DROP=""
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$CONFIG_DIR" "$DATA_DIR"
  chown "$RUN_UID:$RUN_GID" "$CONFIG_DIR" "$DATA_DIR"
  # Individual files only, never `chown -R`: the data directory may contain a
  # bind-mounted `workspaces/` holding the user's real git worktrees, and
  # recursing into it would rewrite ownership of files that live on the host.
  for dir in "$CONFIG_DIR" "$DATA_DIR"; do
    for f in config.json auth.json sessions.db sessions.db-wal sessions.db-shm; do
      [ -e "$dir/$f" ] && chown "$RUN_UID:$RUN_GID" "$dir/$f"
    done
  done
  # Node's os.userInfo() (used by shells, git, tooling) fails with ENOENT
  # "uv_os_get_passwd" when the uid has no /etc/passwd entry, and OPENFOX_UID is
  # typically a host uid (501 on macOS) the image has never heard of. Register it.
  if ! getent passwd "$RUN_UID" >/dev/null 2>&1; then
    echo "openfox:x:$RUN_UID:$RUN_GID:OpenFox:/home/openfox:/bin/bash" >> /etc/passwd
  fi
  DROP="setpriv --reuid=$RUN_UID --regid=$RUN_GID --clear-groups"
fi

# First run: the CLI would otherwise start an interactive setup wizard, which
# cannot work without a TTY. It only runs when config.json is absent, so seed a
# minimal one. An existing config is never touched.
if [ ! -e "$CONFIG_DIR/config.json" ]; then
  log "no config found in $CONFIG_DIR, creating a minimal one"
  printf '%s\n' \
    "{\"providers\":[],\"server\":{\"port\":$PORT,\"host\":\"0.0.0.0\",\"openBrowser\":false},\"workspace\":{\"workdir\":\"$(pwd)\"}}" \
    | ${DROP:+$DROP} tee "$CONFIG_DIR/config.json" >/dev/null
  # `local` = no password. Safe only because the compose file publishes the port
  # on the loopback interface; use a reverse proxy or network auth to expose it.
  printf '%s\n' '{"strategy":"local","encryptedPassword":null}' \
    | ${DROP:+$DROP} tee "$CONFIG_DIR/auth.json" >/dev/null
fi

# AI providers running on the Docker host. Inside the container `localhost` is
# the container itself, so a provider configured as http://localhost:1234 would
# be unreachable. Forward the usual provider ports to the host instead, so the
# same configuration works both on a bare install and here. The forwarders only
# listen on the container's loopback; nothing is exposed. Set OPENFOX_HOST_PORTS
# to an empty string to disable, or to a different comma-separated list.
HOST_PORTS="${OPENFOX_HOST_PORTS-1234,11434,8000,8080}"
if [ -n "$HOST_PORTS" ]; then
  for p in $(echo "$HOST_PORTS" | tr ',' ' '); do
    [ "$p" = "$PORT" ] && continue
    # Unprivileged like the server: they only bind ports above 1024 on loopback.
    ${DROP:+$DROP} socat "TCP-LISTEN:$p,bind=127.0.0.1,fork,reuseaddr" "TCP:host.docker.internal:$p" 2>/dev/null &
  done
fi

exec ${DROP:+$DROP} node /app/dist/cli/index.js --port "$PORT" --no-browser
