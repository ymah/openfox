# syntax=docker/dockerfile:1.7
#
# OpenFox as a deployable container. See docs/DOCKER.md.
#
# Three stages so the runtime image carries neither the build toolchain's
# leftovers nor the web app's dev dependencies:
#   build      compiles the server (tsup) and the web app (vite)
#   prod-deps  installs only the runtime dependencies, natives included
#   runtime    the image you actually run

ARG NODE_VERSION=24

# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS build

# python3/make/g++ only matter if better-sqlite3 has no prebuilt binary for the
# target platform and has to compile.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --ignore-scripts: the root `postinstall` runs `npm install` inside web/ and
# `prepare` runs husky, neither of which we want here. The two native modules
# are rebuilt explicitly instead, and web/ gets a proper `npm ci`.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm rebuild better-sqlite3 node-pty

# web/ depends on `@openfox/shared: file:..`, i.e. it links the root package, so a
# plain `npm ci` here would also run the root's postinstall/prepare scripts —
# again not wanted, and scripts/ has not been copied yet at this point.
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci --ignore-scripts

COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS prod-deps

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
 && npm rebuild better-sqlite3 node-pty \
 && npm cache clean --force

# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

# The agent runs arbitrary shell commands inside this container, so it only has
# what is installed here — the host's node, python and brew tools are not
# available. This is the "dev toolbox": enough for most dev, GTD and writing
# projects. `git`, `bash` and `ps` are hard requirements of the server itself.
# `socat` is used by the entrypoint to reach AI providers running on the host.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      git bash procps ripgrep curl jq \
      python3 make g++ \
      ca-certificates tini socat util-linux \
 && rm -rf /var/lib/apt/lists/*

# Projects are bind-mounted from the host, so their owner rarely matches the user
# inside the container and git would refuse to touch them ("dubious ownership").
RUN git config --system --add safe.directory '*'

ENV NODE_ENV=production \
    OPENFOX_HOST=0.0.0.0 \
    OPENFOX_PORT=10369 \
    XDG_CONFIG_HOME=/data \
    XDG_DATA_HOME=/data \
    HOME=/home/openfox

# HOME is world-writable so the server can run as any uid (OPENFOX_UID) without
# a matching /etc/passwd entry; tool caches there are deliberately ephemeral.
RUN mkdir -p /home/openfox /data /projects \
 && chmod 1777 /home/openfox

WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

COPY docker/entrypoint.sh /usr/local/bin/openfox-entrypoint
COPY docker/openfox /usr/local/bin/openfox
RUN chmod +x /usr/local/bin/openfox-entrypoint /usr/local/bin/openfox

EXPOSE 10369
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${OPENFOX_PORT}/api/health" >/dev/null || exit 1

# tini -g signals the whole process group, so the port forwarders started by the
# entrypoint stop together with the server.
ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/usr/local/bin/openfox-entrypoint"]
