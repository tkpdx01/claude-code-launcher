# claude-code-launcher (ccc)

Claude Code Settings Launcher - Manage multiple Claude Code profiles with different API configurations.

📖 [中文版本](README-CN.md) | [English Version](README.md)

## Installation

```bash
npm install -g claude-code-launcher
```

## Usage

### Launch Claude

```bash
ccc                    # Use default profile or interactive select
ccc <profile>          # Launch with specific profile
ccc -d, --ddd          # Launch with --dangerously-skip-permissions
ccc <profile> -d       # Combine profile and ddd flag
```

### Manage Profiles

```bash
ccc list               # List all profiles
ccc list -v            # List with API URLs
ccc show [profile]     # Show full profile config
ccc use <profile>      # Set default profile
ccc new [name]         # Create new profile from template
ccc import             # Import from pasted text (auto-detect URL/Token)
ccc sync [profile]     # Sync settings from template (preserve API config)
ccc sync -a            # Sync all profiles
ccc edit [profile]     # Edit profile
ccc delete [profile]   # Delete profile
ccc help               # Show help
```

## Features

- **Multiple Profiles**: Manage different API configurations for Claude Code
- **Template Support**: Create profiles based on `~/.claude/settings.json`
- **Smart Import**: Auto-detect API URL and sk-token from pasted text
- **Sync Settings**: Update profiles from template while preserving API credentials
- **Interactive UI**: Select profiles interactively when not specified

## Profile Storage

- Profiles: `~/.ccc/profiles/*.json`
- Template: `~/.claude/settings.json`

## Examples

```bash
# Create a new profile based on template
ccc new kfc

# Import from clipboard (paste URL and token)
ccc import
# Paste: https://api.example.com/v1 sk-abc123...

# Sync all profiles with latest template settings
ccc sync -a

# Launch with specific profile and skip permissions
ccc kfc -d
```

## License

MIT
