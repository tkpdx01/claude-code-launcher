# ccc

> Zero-dependency profile switcher for **Claude Code** & **OpenAI Codex**.

```bash
npm i -g @tkpdx01/ccc
```

```bash
ccc new          # create a profile
ccc list         # list all
ccc 3            # launch #3
ccc -d           # launch with --dangerously-skip-permissions / --full-auto
```

## How It Works

```
 ~/.ccc/profiles/api.json        ~/.claude/settings.json
      credentials only        +        read-only
              │                           │
              └──── merge at launch ──────┘
                         │
                   ~/.ccc/tmp/api.json
                         │
                claude --settings <tmp>
```

Profiles store only API URL + key (~5 lines). At launch, your global
`settings.json` is read (never written), merged with credentials, and
passed to `claude` / `codex` via a temp file. Nothing is polluted.

## Commands

| | |
|---|---|
| `ccc list` | List profiles |
| `ccc new [name]` | Create profile |
| `ccc edit [profile]` | Edit credentials |
| `ccc show [profile]` | Show details |
| `ccc use <profile>` | Set default |
| `ccc delete [profile]` | Delete |

## Storage

```
~/.ccc/
├── profiles/          # Claude  { apiUrl, apiKey }
├── codex-profiles/    # Codex   auth.json + config.toml
├── tmp/               # Merged settings (ephemeral)
└── default            # Default profile name
```

## License

MIT
