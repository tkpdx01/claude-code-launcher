# claude-code-launcher (ccc)

Claude Code Settings Launcher - Launch Claude Code with different settings profiles. Run multiple Claude instances with different API configurations simultaneously.

Claude Code 设置启动器 - 使用不同的 settings profile 文件启动 Claude Code，可同时运行多个使用不同 API 配置的 Claude 实例。

## Compatibility / 兼容性

Tested export file versions / 已测试的导出文件版本：

| Tool | Version | Export Format |
|------|---------|---------------|
| [cc-switch](https://github.com/farion1231/cc-switch) | 3.8.2 | SQL |
| [All API Hub](https://github.com/qixing-jk/all-api-hub) | v2.26.1 | JSON |

## Installation / 安装

```bash
npm install -g @tkpdx01/ccc
```

## Usage / 使用

### Launch / 启动

```bash
ccc                    # Default profile or select / 使用默认或交互选择
ccc <profile>          # Specific profile / 指定配置
ccc -d                 # With --dangerously-skip-permissions
ccc <profile> -d       # Combine both / 组合使用
```

### Manage Profiles / 管理配置

```bash
ccc list               # List profiles / 列出配置
ccc list -v            # List with URLs / 显示 API URLs
ccc show [profile]     # Show config / 显示完整配置
ccc use <profile>      # Set default / 设置默认
ccc new [name]         # Create from template / 从模板创建
ccc import             # Import from cc-switch SQL or All API Hub JSON / 导入 cc-switch SQL 或 All API Hub JSON
ccc sync [profile]     # Sync from template / 从模板同步
ccc sync -a            # Sync all / 同步所有
ccc edit [profile]     # Edit profile / 编辑配置
ccc delete [profile]   # Delete profile / 删除配置
```

## Features / 功能

- **Multiple Profiles / 多配置**: Manage different API configurations
- **Template Support / 模板**: Based on `~/.claude/settings.json`
- **Smart Import / 智能导入**: Auto-detect API URL and token
- **Sync Settings / 同步**: Update from template, preserve credentials

## Sync Command / 同步命令

The `sync` command updates profiles with the latest settings from `~/.claude/settings.json` while preserving each profile's API credentials (`ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL`).

`sync` 命令从 `~/.claude/settings.json` 同步最新设置到 profiles，同时保留每个 profile 的 API 凭证（`ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_BASE_URL`）。

```bash
ccc sync [profile]     # Sync single profile / 同步单个配置
ccc sync --all         # Sync all profiles / 同步所有配置
```

Use this when you've updated your main Claude settings (plugins, model, etc.) and want to apply those changes to all profiles.

当你更新了主 Claude 设置（插件、模型等）并想将这些更改应用到所有 profiles 时使用此命令。

## Storage / 存储

- Profiles: `~/.ccc/profiles/*.json`
- Template: `~/.claude/settings.json`

## License / 许可证

MIT
