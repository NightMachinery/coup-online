# Self-hosting Coup Online

This repo includes a bare-metal self-host flow with no Docker.

## What it does

- builds the shared package, server, and client
- serves the app behind Caddy at a supplied host or URL
- runs the app in tmux sessions
- keeps the client usable on an intranet with local assets only
- uses local browser-stored profiles instead of Firebase sign-in for self-hosted mode

## Defaults

- default host: `coup.pinky.lilf.ir`
- server: `127.0.0.1:8008`
- client preview: `127.0.0.1:4273`
- tmux sessions:
  - `coup-online-server`
  - `coup-online-client`

## Requirements

- Ubuntu/Debian-style host recommended
- `tmux`, `caddy`, and `redis-server`
- `nvm-load`
- Node `20.20.0`

`self_host.zsh setup` will try to install missing `tmux`, `caddy`, and `redis-server` with `apt-get` when available.

## Commands

From repo root:

```zsh
./self_host.zsh setup
./self_host.zsh start
./self_host.zsh stop
```

Use a different host or full URL:

```zsh
./self_host.zsh setup coup.example.internal
./self_host.zsh setup https://coup.example.internal
./self_host.zsh setup http://10.0.0.42
```

Notes:

- bare hosts default to HTTP in the generated client env and Caddy site block for easier intranet use
- passing an explicit `https://...` URL enables HTTPS instead
- `start <host-or-url>` will run `setup` first if the self-host env files or build outputs do not exist

## Runtime layout

Caddy proxies:

- `/api/*` and `/socket.io*` -> `127.0.0.1:8008`
- everything else -> `127.0.0.1:4173`

The managed Caddy block is written into `~/Caddyfile` between:

- `# BEGIN coup-online self-host`
- `# END coup-online self-host`

## Self-hosted auth mode

The self-hosted client uses `VITE_AUTH_MODE=local`.

That mode:

- generates a local auth token and uid in browser storage
- stores the chosen display name in browser storage
- keeps game creation/join flows working without Firebase
- hides Firebase-backed leaderboard/profile UI

## Generated files

`setup` writes:

- `server/.env.self-hosted.local`
- `client/.env.self-hosted.local`

The server env points Redis at:

```text
redis://127.0.0.1:6379
```

## Asset/offline notes

- fonts come from `@fontsource` and are bundled into the client build
- public images, icons, and background assets are served from the local build
- Vercel analytics is not used in the self-hosted flow
- client API and socket targets are configured to use the supplied host instead of public SaaS endpoints

## Troubleshooting

### Redis is not running

```zsh
redis-cli ping
sudo systemctl enable --now redis-server
```

### Caddy config changed but site did not reload

```zsh
caddy validate --config ~/Caddyfile --adapter caddyfile
caddy reload --config ~/Caddyfile --adapter caddyfile
```

### Check tmux sessions

```zsh
tmux ls
```

Attach to a session:

```zsh
tmux attach -t coup-online-server
```
