# claude-code-launcher (ccc)

Claude Code 设置启动器 - 管理多个 Claude Code 配置文件的不同 API 配置。

📖 [English Version](README.md) | [中文版本](README-CN.md)

## 安装

```bash
npm install -g claude-code-launcher
```

## 使用方法

### 启动 Claude

```bash
ccc                    # 使用默认配置文件或交互式选择
ccc <profile>          # 使用特定配置文件启动
ccc -d, --ddd          # 使用 --dangerously-skip-permissions 启动
ccc <profile> -d       # 结合配置文件和 ddd 标志
```

### 管理配置文件

```bash
ccc list               # 列出所有配置文件
ccc list -v            # 列出并显示 API URLs
ccc show [profile]     # 显示完整的配置文件配置
ccc use <profile>      # 设置默认配置文件
ccc new [name]         # 从模板创建新配置文件
ccc import             # 从粘贴文本导入（自动检测 URL/Token）
ccc sync [profile]     # 从模板同步设置（保留 API 配置）
ccc sync -a            # 同步所有配置文件
ccc edit [profile]     # 编辑配置文件
ccc delete [profile]   # 删除配置文件
ccc help               # 显示帮助
```

## 功能特点

- **多配置文件**：管理 Claude Code 的不同 API 配置
- **模板支持**：基于 `~/.claude/settings.json` 创建配置文件
- **智能导入**：自动从粘贴文本中检测 API URL 和 sk-token
- **同步设置**：更新配置文件从模板，同时保留 API 凭据
- **交互式 UI**：未指定时交互式选择配置文件

## 配置文件存储

- 配置文件：`~/.ccc/profiles/*.json`
- 模板：`~/.claude/settings.json`

## 示例

```bash
# 从模板创建新配置文件
ccc new kfc

# 从剪贴板导入（粘贴 URL 和 token）
ccc import
# 粘贴：https://api.example.com/v1 sk-abc123...

# 使用最新模板设置同步所有配置文件
ccc sync -a

# 使用特定配置文件启动并跳过权限
ccc kfc -d
```

## 许可证

MIT
