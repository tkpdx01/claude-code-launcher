# claude-code-launcher (ccc)

Claude Code Settings Launcher - Manage multiple Claude Code profiles with different API configurations.

Claude Code 设置启动器 - 管理多个 Claude Code 配置文件的不同 API 配置。

## Compatibility / 兼容性

| Tool | Version |
|------|---------|
| [cc-switch](https://github.com/anthropics/claude-code) | 3.8.2 |
| [All API Hub](https://allapihub.com) | v2.26.1 |

## Installation / 安装

```bash
npm install -g claude-code-launcher
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
ccc import             # Import URL/Token / 导入 URL/Token
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

## Storage / 存储

- Profiles: `~/.ccc/profiles/*.json`
- Template: `~/.claude/settings.json`

## License / 许可证

MIT
