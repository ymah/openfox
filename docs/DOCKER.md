# Running OpenFox in Docker

OpenFox ships a `Dockerfile` and a `docker-compose.yml`, so it can be deployed as a
container instead of being installed globally with npm.

- **Projects stay on the host.** They are bind-mounted, never copied into the image.
- **State lives in a Docker volume.** Config, credentials and the session database.
- **The UI is published on the loopback interface only**, by default.

## Quick start

```bash
cp .env.example .env        # optional — every variable has a default
docker compose up -d --build
# open http://localhost:10369
```

The first start creates a minimal config (no interactive wizard, which would need a
TTY). Add your AI provider from the UI, or with `docker compose exec openfox openfox
provider add`.

`scripts/openfox-docker` wraps the container so the `openfox` command keeps working
on your PATH:

```bash
ln -s "$PWD/scripts/openfox-docker" ~/.local/bin/openfox
openfox start | stop | restart | status | logs -f | rebuild | shell
openfox provider list          # any other command runs the CLI inside the container
```

## Configuration

Everything machine-specific goes in `.env` (see `.env.example`) or in
`docker-compose.override.yml`, which Compose loads automatically and Git ignores.
Nothing personal belongs in the committed `docker-compose.yml`.

| Variable                      | Default                | Meaning                                                                                              |
| ----------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `OPENFOX_BIND`                | `127.0.0.1`            | Interface the port is published on.                                                                  |
| `OPENFOX_PUBLISH_PORT`        | `10369`                | Host port.                                                                                           |
| `OPENFOX_UID` / `OPENFOX_GID` | `1000`                 | uid/gid the server runs as, so files it creates in your projects belong to you. macOS: `501` / `20`. |
| `OPENFOX_PROJECTS_DIR`        | `./projects`           | Host folder mounted at `/projects`.                                                                  |
| `OPENFOX_HOST_PORTS`          | `1234,11434,8000,8080` | Ports forwarded to the Docker host (see below). Empty disables.                                      |
| `OPENFOX_HEAP_MB`             | `3072`                 | V8 heap **ceiling**.                                                                                 |
| `OPENFOX_MEM_LIMIT`           | `4g`                   | Container memory limit.                                                                              |

### Security: keep the port on loopback

The default authentication strategy is `local`, i.e. **no password**, and OpenFox can
run shell commands. The server listens on `0.0.0.0` inside the container, so it is the
_published_ port that keeps it private. Do not set `OPENFOX_BIND=0.0.0.0` without
network authentication or a reverse proxy in front (see `REVERSE-PROXY.md`).

### Memory

`OPENFOX_HEAP_MB` is a ceiling the process may grow to, **not** a reservation. Measured
in this setup, an idle container uses on the order of 100 MB. Raise both values on a
machine with plenty of RAM (for example `8192` and `10g`); there is no need to give the
Docker VM more memory just for OpenFox.

## Using any folder on the host

OpenFox stores project paths, git worktrees and the state directory as **absolute host
paths** in its database. The container therefore has to see the same folders at the
**same paths**, or existing projects and worktrees break. That is what the override
file does on macOS:

```yaml
volumes:
  - /Users:/Users
  - /Volumes:/Volumes
  - /tmp:/tmp
```

Two consequences worth knowing:

- **This gives the agent your whole home directory** — including `~/.ssh` — exactly as
  a native install does. The container adds reproducible tooling and a loopback-only
  port, not filesystem isolation. To restrict it, mount only your project folders
  instead of `/Users`; adding a project elsewhere then needs a one-line change and a
  restart.
- **Docker Desktop only shares the roots listed in its File sharing settings** (by
  default `/Users`, `/Volumes`, `/private`, `/tmp`). A project under `/opt` or
  `/usr/local` needs adding there. Outside a shared root, OpenFox's folder picker lists
  the **container's** filesystem, not the host's — `/opt` shows the image's own
  `/opt`, which is easy to mistake for yours.

### The state directory and worktrees

OpenFox reads its config from `XDG_CONFIG_HOME` and keeps its database and worktrees
under `XDG_DATA_HOME` on Linux (both are one folder on macOS). The generic setup uses
one volume at `/data`. The macOS override instead points **both** variables at
`~/Library/Application Support` and mounts the volume there, so paths recorded by a
native macOS install keep resolving. Worktrees are bind-mounted on top from the host,
so they stay where you can see them in your editor.

The database sits in a named volume rather than a host folder on purpose: SQLite in WAL
mode is safer on the VM's own disk than on a shared filesystem.

## AI providers

- **On another machine of your network:** use its address in the provider URL; nothing
  else is needed.
- **On the Docker host** (LM Studio, Ollama, vLLM, llama.cpp): inside the container
  `localhost` is the container itself. The entrypoint forwards `OPENFOX_HOST_PORTS` to
  `host.docker.internal`, so a provider configured as `http://localhost:1234` works
  unchanged and the same configuration is valid on a native install. The forwarders
  only listen on the container's loopback. On Docker Desktop this reaches services that
  are bound to `127.0.0.1` on the host, so LM Studio's default setting is enough.

## Web search without a key

`web_search` needs a search engine: Tavily (an API key) or SearXNG. The compose file bundles a private
SearXNG so it works with no account and no key. Add two lines to `.env`, then `openfox rebuild`:

```
COMPOSE_PROFILES=search
OPENFOX_SEARCH=searxng
```

- SearXNG is only reachable from the OpenFox container (`http://searxng:8080`); no port is published. Its
  settings are in `docker/searxng/settings.yml` (JSON output enabled, rate limiter off).
- `OPENFOX_SEARCH=searxng` sets `SEARXNG_URL` for OpenFox unless you already set one, and leaves it unset
  otherwise so an engine chosen in Settings → Search still applies. A Tavily key, if configured, wins.
- SearXNG queries public search engines on your behalf; results depend on what they return and may be
  rate-limited by them.

## What the agent can and cannot use

The agent runs shell commands **inside the container**, so it only has what the image
contains: git, bash, ripgrep, curl, jq, python3, make, g++, Node 24. The host's own
node, python, Homebrew tools, language servers and pentest tooling are not available;
add what you need to the `Dockerfile`.

A development server started by the agent listens inside the container. Its port is
not published, so `http://localhost:3000` will not open from your browser unless you
publish that port.

## Performance on macOS

Bind mounts go through the VM's shared filesystem, which is much slower than native
for file-heavy work. Measured on a repository with a 57,000-file `node_modules`:
listing it took about 7.5 s against 0.8 s natively (roughly 10×), and `git status`
about 5× longer. Ordinary editing and small repositories are not noticeably affected.

## Backup and restore

```bash
# backup
docker run --rm -v openfox_openfox-data:/vol -v "$PWD":/out alpine \
  tar czf /out/openfox-data.tgz -C /vol .

# restore into a fresh volume
docker run --rm -v openfox_openfox-data:/vol -v "$PWD":/in alpine \
  tar xzf /in/openfox-data.tgz -C /vol
```

To copy an existing native database in, snapshot it with `sqlite3 sessions.db ".backup
'copy.db'"` rather than copying the file: it is safe while OpenFox is running and
handles the WAL files correctly. Stop OpenFox first if you can.

## Updating

**Rebuild the image** (`openfox rebuild`, or `docker compose up -d --build`).

Do **not** use the in-app "update" button in a container. It checks the upstream
`openfox` package on npm and would run `openfox update` inside the container, replacing
your build until the next restart.

## Docker Desktop

Docker Desktop must be running for OpenFox to be reachable. Enable _Start Docker
Desktop when you sign in_; `restart: unless-stopped` then brings OpenFox back up.
