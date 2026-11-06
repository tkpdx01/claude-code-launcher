// i18n — English (default) + Chinese, persisted to ~/.ccc/config.json

import fs from 'fs';
import path from 'path';
import { CONFIG_DIR } from './config.js';
import { atomicWrite } from './files.js';

const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const strings = {
  en: {
    'ui.workspace': 'Your AI workspace',
    'ui.profile_keys': '↵ launch · ^E edit · ^N new · ^A apply · ^D delete · / search',
    'common.keep_secret': '(Enter to keep current key)',
    'new.alias': 'This name is a session compatibility link; use "{name}"',
    'default.saved': 'Default profile: {name}',
    'cleanup.usage': 'Usage: ccc cleanup --keep <names...> [--dry-run | --apply [--yes]]',
    'cleanup.empty': 'Nothing to clean up',
    'cleanup.preview': '{count} profiles would be archived. Add --apply to proceed.',
    'cleanup.confirm': 'Archive these {count} profiles? Sessions will be preserved.',
    'recovery.saved': 'Restore with: ccc restore {id}',
    'recovery.empty': 'No recovery records',
    'recovery.select': 'Select a recovery record:',
    'recovery.confirm': 'Restore these files?',
    'recovery.restored': 'Restored',
    'help.cmd.default': 'Show or set the default profile',
    'help.cmd.cleanup': 'Preview cleanup; add --apply to archive',
    'help.cmd.restore': 'Restore archived profiles or applied settings',
    'ui.actions': 'What would you like to do?',
    'ui.keys': '↑↓ or j/k move · / search · enter select · q quit',
    'ui.keys_short': '/ search · ↑↓ · ↵ · q',
    'ui.search_hint': 'Type to filter…',
    'ui.search_keys': '↑↓ move · enter select · esc clear · ctrl+u reset',
    'ui.search_keys_short': 'esc clear · ↑↓ · enter',
    'ui.matches': '{count}/{total} matches',
    'ui.no_matches': 'No matches',
    'ui.profiles': 'Profiles',
    'ui.profile': 'Profile',
    'ui.type': 'Provider',
    'ui.endpoint': 'Endpoint',
    'ui.count': '{count} available',
    // Main menu
    'menu.empty': 'No profiles yet. Let\'s create one.',

    // Pick profile
    'pick.launch': 'Select profile to launch:',
    'pick.apply': 'Select profile to apply:',
    'pick.edit': 'Select profile to edit:',
    'pick.delete': 'Select profile to delete:',
    'pick.show': 'Select profile to view:',

    // Common
    'common.cancelled': 'Cancelled',
    'common.no_profiles': 'No profiles available',
    'common.no_profiles_hint': 'Use "ccc new" to create one',
    'common.not_exist': 'Profile "{name}" does not exist',
    'common.not_exist_hint': 'Use "ccc list" to see all profiles',
    'common.not_set': '(not set)',
    'common.default': '(default)',
    'common.profile_name': 'Profile name:',
    'common.profile_type': 'Profile type:',
    'common.apikey_required': 'API key cannot be empty',
    'common.settings_invalid': 'Cannot read valid settings from {path}; fix the file and retry',

    // List
    'list.footer': '{count} profiles, launch: ccc <name> or ccc <number>',

    // New
    'new.name_empty': 'Name cannot be empty',
    'new.name_reserved': 'Name conflicts with a command keyword',
    'new.name_invalid': 'Name contains invalid characters',
    'new.name_long': 'Name too long (max 64)',
    'new.exists': 'Profile "{name}" already exists ({type}), overwrite?',
    'new.created_codex': 'Created Codex profile "{name}"',
    'new.created_claude': 'Created Claude profile "{name}"',
    'new.anyrouter_1m': 'AnyRouter requires 1M context; enabled automatically',
    'new.created_deepseek': 'Created DeepSeek profile "{name}"',
    'new.launch_codex': 'Launch Codex now?',
    'new.launch_claude': 'Launch Claude now?',
    'new.launch_deepseek': 'Launch Claude Code (DeepSeek) now?',

    // Edit
    'edit.current': 'Current config ({name}) {tag}:',
    'edit.renamed': 'Renamed to "{name}" and saved',
    'edit.updated': 'Profile "{name}" updated',
    'edit.exists': 'Profile "{name}" already exists',

    // Delete
    'delete.confirm': 'Archive {type} profile "{name}" for recovery?',
    'delete.done': 'Deleted {type} profile "{name}"',

    // Show
    'show.extra_env': 'Extra env',
    'show.settings_overrides': 'Settings overrides',

    // Apply
    'apply.confirm': 'Apply "{name}" credentials to {target}?',
    'apply.failed': 'Failed to read profile',
    'apply.done_claude': 'Applied "{name}" to ~/.claude/settings.json',
    'apply.done_codex': 'Applied "{name}" to ~/.codex/',
    'apply.hint': 'You can now run `{cmd}` directly.',

    // Launch
    'launch.claude': 'Launch Claude Code: {name}',
    'launch.codex': 'Launch Codex: {name}',
    'launch.deepseek': 'Launch Claude Code (DeepSeek): {name}',
    'launch.failed': 'Launch failed: {msg}',
    'launch.full_access': 'FULL ACCESS — permissions and sandbox disabled',
    'launch.cmd_claude': 'Command: claude {args}',
    'launch.cmd_codex': 'CODEX_HOME={home} codex {args}',
    'launch.fix_provider': 'Auto-fixed config.toml: renamed reserved provider "openai" → "ccc_openai"',

    // Models
    'models.fetching': 'Fetching model list...',
    'models.default': '(default model)',
    'models.manual': 'Enter model ID manually',
    'models.failed': 'Failed to fetch models, manual input ({reason})',
    'models.prompt': 'Model (leave empty for default):',
    'models.select': 'Select model:',

    // Help
    'help.interactive': 'Interactive:',
    'help.interactive.ccc': 'Profile picker; Enter launches the default selection',
    'help.quick': 'Quick launch:',
    'help.quick.name': 'Launch by name',
    'help.quick.number': 'Launch by index',
    'help.quick.ddd': 'Claude: --dangerously-skip-permissions / Codex: --dangerously-bypass-approvals-and-sandbox',
    'help.quick.args': 'Pass arguments to claude/codex unchanged',
    'help.commands': 'Commands:',
    'help.cmd.list': 'List all profiles',
    'help.cmd.new': 'Create profile',
    'help.cmd.edit': 'Edit credentials',
    'help.cmd.show': 'View details',
    'help.cmd.apply': 'Write to main config (for native launch)',
    'help.cmd.delete': 'Remove profile',

    // Lang
    'lang.switched': 'Language set to English',
  },

  zh: {
    'ui.workspace': '你的 AI 工作台',
    'ui.profile_keys': '↵ 启动 · ^E 编辑 · ^N 新建 · ^A 应用 · ^D 删除 · / 搜索',
    'common.keep_secret': '（回车保留当前密钥）',
    'new.alias': '此名称是会话兼容链接，请使用 "{name}"',
    'default.saved': '默认配置：{name}',
    'cleanup.usage': '用法：ccc cleanup --keep <名称...> [--dry-run | --apply [--yes]]',
    'cleanup.empty': '没有需要清理的配置',
    'cleanup.preview': '将归档 {count} 个配置。添加 --apply 执行。',
    'cleanup.confirm': '归档这 {count} 个配置？会话数据将一并保留。',
    'recovery.saved': '恢复命令：ccc restore {id}',
    'recovery.empty': '没有可恢复记录',
    'recovery.select': '选择恢复记录：',
    'recovery.confirm': '恢复这些文件？',
    'recovery.restored': '已恢复',
    'help.cmd.default': '查看或设置默认配置',
    'help.cmd.cleanup': '预览清理；添加 --apply 执行归档',
    'help.cmd.restore': '恢复已归档的配置或应用前的设置',
    'ui.actions': '准备做什么？',
    'ui.keys': '↑↓ 或 j/k 移动 · / 搜索 · enter 选择 · q 退出',
    'ui.keys_short': '/ 搜索 · ↑↓ · ↵ · q',
    'ui.search_hint': '输入关键词筛选…',
    'ui.search_keys': '↑↓ 移动 · enter 选择 · esc 清除 · ctrl+u 重置',
    'ui.search_keys_short': 'esc 清除 · ↑↓ · enter',
    'ui.matches': '{count}/{total} 项匹配',
    'ui.no_matches': '没有匹配项',
    'ui.profiles': '配置库',
    'ui.profile': '配置',
    'ui.type': '服务商',
    'ui.endpoint': 'API 地址',
    'ui.count': '{count} 个可用配置',
    'menu.empty': '还没有 profile，开始创建一个吧',

    'pick.launch': '选择要启动的 profile:',
    'pick.apply': '选择要应用的 profile:',
    'pick.edit': '选择要编辑的 profile:',
    'pick.delete': '选择要删除的 profile:',
    'pick.show': '选择要查看的 profile:',

    'common.cancelled': '已取消',
    'common.no_profiles': '没有可用的 profile',
    'common.no_profiles_hint': '使用 "ccc new" 创建一个',
    'common.not_exist': 'Profile "{name}" 不存在',
    'common.not_exist_hint': '使用 ccc list 查看所有 profile',
    'common.not_set': '(未设置)',
    'common.default': '(默认)',
    'common.profile_name': 'Profile 名称:',
    'common.profile_type': 'Profile 类型:',
    'common.apikey_required': 'API 密钥不能为空',
    'common.settings_invalid': '无法从 {path} 读取有效配置，请修复文件后重试',

    'list.footer': '{count} 个 profile，启动: ccc <name> 或 ccc <number>',

    'new.name_empty': '名称不能为空',
    'new.name_reserved': '名称与命令关键词冲突',
    'new.name_invalid': '名称包含无效字符',
    'new.name_long': '名称过长（最多 64 个字符）',
    'new.exists': 'Profile "{name}" 已存在（{type}），是否覆盖？',
    'new.created_codex': '已创建 Codex profile "{name}"',
    'new.created_claude': '已创建 Claude profile "{name}"',
    'new.anyrouter_1m': 'AnyRouter 需要 1M 上下文，已自动写入配置',
    'new.created_deepseek': '已创建 DeepSeek profile "{name}"',
    'new.launch_codex': '现在启动 Codex？',
    'new.launch_claude': '现在启动 Claude？',
    'new.launch_deepseek': '现在启动 Claude Code (DeepSeek)？',

    'edit.current': '当前配置 ({name}) {tag}:',
    'edit.renamed': '已重命名为 "{name}" 并保存',
    'edit.updated': 'Profile "{name}" 已更新',
    'edit.exists': 'Profile "{name}" 已存在',

    'delete.confirm': '将 {type} 配置 "{name}" 移入可恢复归档？',
    'delete.done': '已删除 {type} profile "{name}"',

    'show.extra_env': '额外环境变量',
    'show.settings_overrides': '设置覆盖项',

    'apply.confirm': '将 "{name}" 凭证应用到 {target}？',
    'apply.failed': '读取 profile 失败',
    'apply.done_claude': '已应用 "{name}" 到 ~/.claude/settings.json',
    'apply.done_codex': '已应用 "{name}" 到 ~/.codex/',
    'apply.hint': '现在可以直接运行 `{cmd}` 了',

    'launch.claude': '启动 Claude Code: {name}',
    'launch.codex': '启动 Codex: {name}',
    'launch.deepseek': '启动 Claude Code (DeepSeek): {name}',
    'launch.failed': '启动失败: {msg}',
    'launch.full_access': '完全权限 — 已关闭权限检查和沙箱',
    'launch.cmd_claude': '命令: claude {args}',
    'launch.cmd_codex': 'CODEX_HOME={home} codex {args}',
    'launch.fix_provider': '自动修复 config.toml: 重命名保留 provider "openai" → "ccc_openai"',

    'models.fetching': '正在获取模型列表...',
    'models.default': '(默认模型)',
    'models.manual': '手动输入模型 ID',
    'models.failed': '获取模型列表失败，手动输入（{reason}）',
    'models.prompt': 'Model（留空使用默认）:',
    'models.select': '选择模型:',

    'help.interactive': '交互模式:',
    'help.interactive.ccc': '配置列表；回车启动默认选中项',
    'help.quick': '快速启动:',
    'help.quick.name': '按名称启动',
    'help.quick.number': '按序号启动',
    'help.quick.ddd': 'Claude: --dangerously-skip-permissions / Codex: --dangerously-bypass-approvals-and-sandbox',
    'help.quick.args': '将参数原样传递给 claude/codex',
    'help.commands': '命令:',
    'help.cmd.list': '列出所有 profile',
    'help.cmd.new': '创建 profile',
    'help.cmd.edit': '编辑凭证',
    'help.cmd.show': '查看详情',
    'help.cmd.apply': '写入主配置（原生启动可用）',
    'help.cmd.delete': '删除 profile',

    'lang.switched': '语言已切换为中文',
  },
};

let currentLang = 'en';

// Load language from config on init
function readConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return cfg && typeof cfg === 'object' ? cfg : {};
  } catch {
    return {}; // Missing or malformed launcher config falls back to defaults.
  }
}

const { lang } = readConfig();
if (lang === 'zh' || lang === 'en') currentLang = lang;

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  currentLang = lang;
  try {
    atomicWrite(CONFIG_PATH, JSON.stringify({ ...readConfig(), lang }, null, 2) + '\n');
  } catch { /* A read-only home only loses persistence, not the session switch. */ }
}

// Translate with optional interpolation: t('key', { name: 'foo' })
export function t(key, vars) {
  const s = strings[currentLang]?.[key] || strings.en[key] || key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
}
