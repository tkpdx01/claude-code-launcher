# ccc

> Zero-dependency profile switcher for **Claude Code** & **OpenAI Codex**.

![CCC terminal preview with provider badges, a highlighted menu, and keyboard shortcuts](docs/images/cli-preview.png)

*Terminal preview with demo profiles.*

```bash
npm i -g @tkpdx01/ccc
```

```bash
ccc new          # create a profile
ccc list         # list all
ccc 3            # launch #3
ccc -d           # Claude: --dangerously-skip-permissions; Codex: --dangerously-bypass-approvals-and-sandbox
ccc api -p "Explain this project"  # forward arguments to Claude
ccc api -- --help                # show the child CLI's help
```

The interactive UI includes a workspace header, provider badges, highlighted
menus, and layouts that adapt to terminal width and height.

- Type to filter actions, profiles, or models instantly by name and description
  (including provider). Matching ignores case and accepts multiple keywords,
  such as `codex dev`. The main menu also accepts English action names in Chinese mode.
- Press **/** to start a search, including names beginning with `j`, `k`, or `q`.
  **Backspace** deletes a character, **Ctrl+U** clears the query, and **Esc** clears
  the search and returns to navigation. The menu shows match counts and empty results.
- Use **↑/↓** and **Enter** to choose, or **Home/End** and **Page Up/Down** for
  long lists. Outside search, **j/k** also move and **q** or **Esc** exit.

Chinese text and emoji align by terminal cell width, and long search input keeps
its newest characters visible. Piped output stays free of color codes;
`NO_COLOR=1` also disables colors in interactive terminals.

## How It Works

```
 ~/.ccc/profiles/api.json        ~/.claude/settings.json
      credentials only        +        read-only
              │                           │
              └──── merge at launch ──────┘
                         │
             ~/.ccc/tmp/claude-<id>/api.json
                         │
                claude --settings <tmp>
```

Claude profiles store API URL + key, with optional model, environment, and
settings overrides. At launch, your global `settings.json` is read, merged
with the profile, and passed to `claude` via a private temporary file.
Each launch gets its own file, which is removed when the child exits or
fails to start. Codex uses the profile directory as `CODEX_HOME`.

Normal launches leave global settings unchanged. The explicit `ccc apply`
command writes the selected profile to the global configuration.

Claude launches default to `skipWebFetchPreflight: true`, so WebFetch does
not depend on Anthropic's domain preflight service when using custom or
restricted endpoints. An explicit `false` in the global settings or profile
settings overrides this default.

AnyRouter endpoints (`anyrouter.top` and the same host behind a reverse
proxy) require Claude Code's 1M context header. Creating or editing a
Claude profile with an AnyRouter URL writes that configuration
automatically: `claude-fable-5-1[1m]`, `context-1m-2025-08-07`, and the
flags that would otherwise block experimental betas. Existing AnyRouter
profiles pick up the same overlay at launch and apply without being
rewritten.

Existing full `settings.json` profiles and slim profiles remain supported.
Older ccc-generated Codex profiles with model/provider keys inside
`[analytics]` are repaired on launch or when applied. Other tables are kept.
Malformed Claude global settings produce an error so they can be repaired
without losing existing settings.

Extra launch arguments keep their order. Existing ccc flags (`-d`, `--ddd`,
`--help`, and `--version`, including their short aliases) are still handled
by the launcher; use `--` before arguments that should go entirely to the
child CLI.

## Commands

| | |
|---|---|
| `ccc list` | List profiles |
| `ccc new [name]` | Create profile |
| `ccc edit [profile]` | Edit credentials |
| `ccc show [profile]` | Show details |
| `ccc apply [profile]` | Write profile to global config |
| `ccc delete [profile]` | Delete |

## Development

Requires Node.js 18 or newer and npm. The launcher uses only Node.js built-ins;
there are no third-party runtime or development dependencies.

```bash
npm ci
npm test
```

Commit `package-lock.json` with any dependency change. `.npmrc` saves new
dependencies at exact versions, and CI and publishing use `npm ci` to install
the locked dependency tree and remove leftover packages. The test matrix covers
Node.js 18, 20, 22, and 24 on Linux, macOS, and Windows.

## Storage

```
~/.ccc/
├── profiles/          # Claude  { apiUrl, apiKey }
├── codex-profiles/    # Codex   auth.json + config.toml
├── tmp/               # Per-launch merged settings (ephemeral)
└── config.json        # Launcher preferences (language)
```

Older Codex profiles stored as `~/.ccc/profiles/<name>.json` with `type: "codex"` are still listed and launched as Codex, not Claude. Launching one materializes it into `codex-profiles/`.

## License

MIT
