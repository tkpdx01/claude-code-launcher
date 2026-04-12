// i18n — English (default) + Chinese, persisted to ~/.ccc/config.json

import fs from 'fs';
import path from 'path';
import { CONFIG_DIR } from './config.js';

const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const strings = {
  en: {
    // Main menu
    'menu.header': '{count} profiles · ccc <name> to quick launch',
    'menu.empty': 'No profiles yet. Let\'s create one.',
    'menu.launch': 'Launch',
    'menu.launch.desc': 'Start claude/codex with a profile',
    'menu.apply': 'Apply',
    'menu.apply.desc': 'Write credentials to main config',
    'menu.new': 'New',
    'menu.new.desc': 'Create a new profile',
    'menu.edit': 'Edit',
    'menu.edit.desc': 'Edit profile credentials',
    'menu.show': 'Show',
    'menu.show.desc': 'View profile details',
    'menu.list': 'List',
    'menu.list.desc': 'List all profiles',
    'menu.delete': 'Delete',
    'menu.delete.desc': 'Remove a profile',
    'menu.exit': 'Exit',
    'menu.lang': 'Language',
    'menu.lang.desc': 'English / 中文',

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
    'new.launch_codex': 'Launch Codex now?',
    'new.launch_claude': 'Launch Claude now?',

    // Edit
    'edit.current': 'Current config ({name}) {tag}:',
    'edit.renamed': 'Renamed to "{name}" and saved',
    'edit.updated': 'Profile "{name}" updated',
    'edit.exists': 'Profile "{name}" already exists',

    // Delete
    'delete.confirm': 'Delete {type} profile "{name}"?',
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
    'launch.failed': 'Launch failed: {msg}',
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
    'help.interactive.ccc': 'Main menu (launch, apply, manage)',
    'help.quick': 'Quick launch:',
    'help.quick.name': 'Launch by name',
    'help.quick.number': 'Launch by index',
    'help.quick.ddd': '--dangerously-skip-permissions / --full-auto',
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
    'menu.header': '{count} 个 profile · ccc <name> 快速启动',
    'menu.empty': '还没有 profile，开始创建一个吧',
    'menu.launch': '启动',
    'menu.launch.desc': '选择 profile 启动 claude / codex',
    'menu.apply': '应用',
    'menu.apply.desc': '写入主配置（支持原生启动）',
    'menu.new': '新建',
    'menu.new.desc': '创建 profile',
    'menu.edit': '编辑',
    'menu.edit.desc': '修改凭证',
    'menu.show': '查看',
    'menu.show.desc': '查看 profile 详情',
    'menu.list': '列表',
    'menu.list.desc': '列出所有 profile',
    'menu.delete': '删除',
    'menu.delete.desc': '删除 profile',
    'menu.exit': '退出',
    'menu.lang': '语言',
    'menu.lang.desc': 'English / 中文',

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

    'list.footer': '{count} 个 profile，启动: ccc <name> 或 ccc <number>',

    'new.name_empty': '名称不能为空',
    'new.name_reserved': '名称与命令关键词冲突',
    'new.name_invalid': '名称包含无效字符',
    'new.name_long': '名称过长（最多 64 个字符）',
    'new.exists': 'Profile "{name}" 已存在（{type}），是否覆盖？',
    'new.created_codex': '已创建 Codex profile "{name}"',
    'new.created_claude': '已创建 Claude profile "{name}"',
    'new.launch_codex': '现在启动 Codex？',
    'new.launch_claude': '现在启动 Claude？',

    'edit.current': '当前配置 ({name}) {tag}:',
    'edit.renamed': '已重命名为 "{name}" 并保存',
    'edit.updated': 'Profile "{name}" 已更新',
    'edit.exists': 'Profile "{name}" 已存在',

    'delete.confirm': '删除 {type} profile "{name}"？',
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
    'launch.failed': '启动失败: {msg}',
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
    'help.interactive.ccc': '主菜单（启动、应用、管理）',
    'help.quick': '快速启动:',
    'help.quick.name': '按名称启动',
    'help.quick.number': '按序号启动',
    'help.quick.ddd': '--dangerously-skip-permissions / --full-auto',
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
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      if (cfg.lang === 'zh' || cfg.lang === 'en') currentLang = cfg.lang;
    }
  } catch { /* ignore */ }
}

loadConfig();

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  currentLang = lang;
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    let cfg = {};
    if (fs.existsSync(CONFIG_PATH)) {
      try { cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); } catch { /* */ }
    }
    cfg.lang = lang;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n');
  } catch { /* ignore */ }
}

// Translate with optional interpolation: t('key', { name: 'foo' })
export function t(key, vars) {
  const s = strings[currentLang]?.[key] || strings.en[key] || key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
}
