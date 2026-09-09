# Changelog

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
