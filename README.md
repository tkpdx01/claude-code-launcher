# CCC

> A polished, secure profile launcher for **Claude Code**, **OpenAI Codex**, and compatible gateways.

CCC switches credentials, endpoints, and default models while forwarding the upstream CLI arguments unchanged. It keeps Claude runtime settings temporary and preserves the normal Codex home, sessions, MCP servers, plugins, and skills.

## Install

Requires Node.js 20 or newer.

```bash
npm install -g @tkpdx01/ccc
```

## Quick start

```bash
ccc new work
ccc list
ccc work

# Every argument after the profile is forwarded in order
ccc work --model fable --debug api -p "review this"
ccc codex-prod -m gpt-5.6-terra -C "/repo path" -c x=1 -c y=2
```

The `--` separator is forwarded to the upstream CLI together with every argument after it. Use it when Claude Code needs its own option separator:

```bash
ccc work -- -d api
# Claude receives: ... -- -d api
```

## Full access mode

`-d` is CCC's explicit full-access shortcut:

```text
Claude profile  → --dangerously-skip-permissions
Codex profile   → --dangerously-bypass-approvals-and-sandbox
```

```bash
ccc work -d --model sonnet5
ccc codex-prod -d -m gpt-5.6-sol -C /repo
```

This disables important safety controls. Use it only in an externally isolated environment.

## Models

CCC combines endpoint discovery (`/models`), a local catalog, and unrestricted manual input. Unknown, preview, and private gateway model IDs are accepted without a whitelist.

```bash
ccc models codex-prod --refresh
ccc model codex-prod gpt-5.6-luna
ccc model work fable
ccc model work default
```

The bundled OpenAI-compatible catalog includes:

- `gpt-5.3-codex-spark`
- `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.5`
- `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`
- `codex-auto-review`
- `gpt-image-1.5`, `gpt-image-2`

Claude aliases include `fable`, `sonnet`, `sonnet5`, and `opus`. An explicit CLI `--model`/`-m` overrides the profile model.

## Commands

| Command | Description |
|---|---|
| `ccc` | Open the interactive dashboard |
| `ccc <profile> [args...]` | Launch and transparently forward arguments |
| `ccc new [name]` | Create a profile |
| `ccc edit [profile]` | Edit endpoint, credential, and model |
| `ccc list`, `ccc ls` | List profiles |
| `ccc show [profile]` | Show redacted details |
| `ccc models [profile] --refresh` | Discover models |
| `ccc model <profile> [id]` | Change the profile model |
| `ccc apply [profile] --dry-run` | Preview native config changes |
| `ccc apply [profile] --yes` | Back up and atomically apply changes |
| `ccc apply --rollback --yes` | Restore the latest apply backup |
| `ccc doctor [--json]` | Check binaries, storage, and configuration |
| `ccc delete [profile]` | Delete managed credentials |

Profile creation also supports automation without putting a key in shell history:

```bash
OPENAI_API_KEY=... ccc new gateway \
  --type codex \
  --url https://gateway.example.com/v1 \
  --model gpt-5.6-terra \
  --api-key-env OPENAI_API_KEY
```

## Security and storage

New profiles use a versioned format:

```text
~/.ccc/
├── profiles/       # schemaVersion 2 profiles, mode 0600
├── cache/models/   # model IDs only; never API keys
├── tmp/            # unique Claude runtime settings, removed on exit
└── backups/        # private apply backups and rollback manifest
```

- CCC directories are restricted to `0700` and credential files to `0600` on POSIX systems.
- API keys are entered with masked prompts and never printed by `show`, `doctor`, or apply previews.
- Writes use a temporary file, `fsync`, and atomic rename.
- Invalid native JSON/TOML stops `apply`; it is never silently replaced.
- Codex launches and `doctor` reject a `model_catalog_json` that is missing, invalid, or does not contain the selected model. `ccc apply <profile> --yes` removes only an incompatible catalog so the current Codex bundled metadata is used.
- Legacy Claude and Codex profiles remain readable. Editing a legacy Codex profile migrates its managed credentials while preserving sessions and databases.
- `skipWebFetchPreflight: true` is applied only to custom Claude endpoints, unless explicitly overridden.

Run this after upgrades:

```bash
ccc doctor
```

## Compatibility

CI is configured to test Node.js 20/22 on Linux, macOS, and Windows. Runtime behavior has been verified locally against Claude Code 2.1.207 and Codex CLI 0.144.1; newer upstream arguments are forwarded transparently.

## License

MIT
