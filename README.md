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

### WebDAV Cloud Sync / WebDAV 云同步

```bash
ccc webdav setup       # Configure WebDAV and sync password / 配置 WebDAV 和同步密码
ccc webdav push        # Push profiles to cloud / 推送到云端
ccc webdav pull        # Pull profiles from cloud / 从云端拉取
ccc webdav status      # View sync status / 查看同步状态
```

## Features / 功能

- **Multiple Profiles / 多配置**: Manage different API configurations
- **Template Support / 模板**: Based on `~/.claude/settings.json`
- **Smart Import / 智能导入**: Auto-detect API URL and token
- **Sync Settings / 同步**: Update from template, preserve credentials
- **Claude Env Defaults / Claude 环境变量默认值**: Auto-ensure these values in the `env` section of both `~/.claude/settings.json` and each profile: `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, `CLAUDE_CODE_ATTRIBUTION_HEADER=0`, `DISABLE_INSTALLATION_CHECKS=1`
- **WebDAV Cloud Sync / 云同步**: Encrypted sync across devices

## Sync Command / 同步命令

The `sync` command updates profiles with the latest settings from `~/.claude/settings.json` while preserving each profile's API credentials (`ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL`).

`sync` 命令从 `~/.claude/settings.json` 同步最新设置到 profiles，同时保留每个 profile 的 API 凭证（`ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_BASE_URL`）。

```bash
ccc sync [profile]     # Sync single profile / 同步单个配置
ccc sync --all         # Sync all profiles / 同步所有配置
```

Use this when you've updated your main Claude settings (plugins, model, etc.) and want to apply those changes to all profiles.

当你更新了主 Claude 设置（插件、模型等）并想将这些更改应用到所有 profiles 时使用此命令。

## WebDAV Cloud Sync / WebDAV 云同步

Sync your profiles across multiple devices using any WebDAV service (Nutstore, Nextcloud, etc.).

使用任意 WebDAV 服务（坚果云、Nextcloud 等）在多设备间同步配置。

### Setup / 配置

```bash
ccc webdav setup
```

This will prompt for:
- WebDAV server URL
- Username / Password
- Remote storage path
- Sync password (for encryption)

### Commands / 命令

```bash
ccc webdav push        # Upload encrypted profiles / 上传加密配置
ccc webdav pull        # Download and decrypt / 下载并解密
ccc webdav status      # View sync status / 查看同步状态
ccc webdav push -f     # Force push (skip conflict prompts) / 强制推送
ccc webdav pull -f     # Force pull (skip conflict prompts) / 强制拉取
```

### Security / 安全设计

- **End-to-end encryption**: All data is encrypted locally with AES-256-GCM before upload. Even if someone gains access to your WebDAV storage, they cannot read your API keys without the sync password.

- **Password-based protection**: Your sync password is never transmitted. It derives the encryption key using PBKDF2 (100,000 iterations).

- **Local password caching**: On trusted devices, the password is cached locally (encrypted with machine fingerprint), so you don't need to enter it every time.

- **Manual sync only**: Synchronization only happens when you explicitly run `push` or `pull`. No background processes, no automatic uploads. You always know when your data leaves your machine.

- **Non-destructive merge**: By default, conflicts preserve both versions instead of overwriting. Use `--force` only when you're certain.

**安全设计**：

- **端到端加密**：所有数据在上传前使用 AES-256-GCM 本地加密。即使他人获取了你的 WebDAV 存储访问权限，没有同步密码也无法读取你的 API Key。

- **密码保护**：同步密码永不传输，使用 PBKDF2（10万次迭代）派生加密密钥。

- **本机免密**：在可信设备上，密码使用机器指纹加密缓存在本地，无需每次输入。

- **手动同步**：同步仅在你显式执行 `push` 或 `pull` 时发生。无后台进程，无自动上传。你始终清楚数据何时离开本机。

- **无损合并**：默认情况下，冲突时保留两个版本而非覆盖。仅在确定时使用 `--force`。

## Storage / 存储

- Profiles: `~/.ccc/profiles/*.json`
- Template: `~/.claude/settings.json`

## License / 许可证

MIT
