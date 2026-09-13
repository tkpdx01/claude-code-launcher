# Changelog

## Unreleased

### Performance

- Scan the profile directories once per command; listing 100+ profiles reads each file a single time instead of hundreds of `existsSync`/`readFileSync` calls.
- Resolve `ccc <name>` by checking the two candidate files directly instead of loading every profile.
- Build the CJK/emoji grapheme segmenter lazily and skip it for plain ASCII, share one collator for sorting, and read `package.json` only when the version is shown.
- Repair a Codex profile config (sandbox cleanup, `[analytics]` scope, reserved provider rename) in one read and one write at launch.

### Code quality

- Share profile selection, API key prompting, and cancel/exit handling across the `apply`, `delete`, `edit`, `show`, and `new` commands.
- Move provider defaults (endpoints, DeepSeek models) into one module and the reserved-provider rename into a pure, tested function.
- Simplify prompt helpers so text and confirm prompts share one reader for TTY and piped input.
- Publish only `index.js` and `src/` to npm and declare `engines.node >= 18`.
- Add regression tests for disk traffic during listing and resolution, safe profile names, config repair, and cross-type profile replacement.

## 2.4.0 - 2026-09-10

### Features

- Detect AnyRouter Claude endpoints and enable 1M context automatically when creating or editing a profile.
- Overlay the same 1M header, `[1m]` model suffix, and beta flags at launch and apply so existing AnyRouter profiles work without being rewritten.

### Fixes

- Stop treating slim `type: "codex"` JSON files in `~/.ccc/profiles/` as Claude profiles; list, launch, and apply them as Codex.
- Clear `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` with an empty value (Claude Code treats any non-empty value as enabled) and strip the 1M overlay when a profile is edited off AnyRouter.

## 2.3.1 - 2026-09-10

### Fixes

- Honor `-d` / `--dangerous` full access for Claude (`bypassPermissions`) and Codex (`danger-full-access` plus the YOLO flag).
- Avoid passing `--ask-for-approval` together with `--dangerously-bypass-approvals-and-sandbox`, which current Codex clap rejects.
- Restore cooked TTY mode before spawning the child CLI after the interactive menu.

## 2.3.0 - 2026-09-09

### Features

- Refresh the terminal UI with a workspace header, provider badges, highlighted menus, profile details, and consistent status messages.
- Support compact layouts, Chinese and emoji alignment, window resizing, Home/End, and Page Up/Down navigation.
- Forward Claude and Codex launch arguments in their original order; use `--` to pass flags shared with the launcher.
- Preserve plain output for pipes and respect `NO_COLOR` and dumb terminals.

### Fixes

- Keep DeepSeek models and explicit profile environment overrides during launch and apply.
- Preserve newly saved profiles when replacing Claude and DeepSeek profiles with the same name.
- Write Codex model/provider keys at the TOML root and repair older ccc-generated profiles with misplaced analytics keys.
- Escape TOML strings when creating or editing Codex profiles while preserving other settings and model capability files.
- Require complete numeric profile indices and correctly resolve names containing `.json` or JavaScript prototype property names.
- Give each Claude launch a private settings file and remove it after child exit or startup failure.
- Forward termination signals and report nonzero child exit statuses correctly.
- Deep-merge settings during apply and reject malformed global Claude settings instead of overwriting them.
- Resolve Windows npm launch shims correctly and escape arguments passed through batch wrappers.

### Compatibility and validation

- Keep existing profile directories, legacy Claude settings profiles, command aliases, and zero runtime dependencies.
- Retain upstream Codex model capability preservation, support-file copying, sandbox configuration cleanup, and the `-d` mapping to `--dangerously-bypass-approvals-and-sandbox`.
- Add regression coverage and a CI matrix for Linux, macOS, and Windows on Node 18, 20, 22, and 24.
