import fs from 'fs';
import path from 'path';
import os from 'os';
import { CONFIG_DIR, PROFILES_DIR, CODEX_PROFILES_DIR, DEFAULT_FILE, CLAUDE_SETTINGS_PATH, CODEX_HOME_PATH } from './config.js';

function stringifyClaudeSettings(settings) {
  // Claude Code 默认 settings.json 使用 2 空格缩进，并以换行结尾（便于 diff/兼容各平台编辑器）
  return `${JSON.stringify(settings, null, 2)}\n`;
}

// 确保目录存在
export function ensureDirs() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!fs.existsSync(PROFILES_DIR)) {
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
  }
  if (!fs.existsSync(CODEX_PROFILES_DIR)) {
    fs.mkdirSync(CODEX_PROFILES_DIR, { recursive: true });
  }
}

// 获取所有 profiles（按 a-z 排序）
export function getProfiles() {
  ensureDirs();
  const files = fs.readdirSync(PROFILES_DIR);
  return files
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
    .sort((a, b) => a.localeCompare(b, 'zh-CN', { sensitivity: 'base' }));
}

// 获取带序号的 profiles 映射 { 序号: profileName }
export function getProfilesWithIndex() {
  const profiles = getProfiles();
  const map = {};
  profiles.forEach((p, i) => {
    map[i + 1] = p;
  });
  return { profiles, map };
}

// 根据序号或名称解析 profile
export function resolveProfile(input) {
  const { profiles, map } = getProfilesWithIndex();

  // 尝试作为数字序号
  const num = parseInt(input, 10);
  if (!isNaN(num) && map[num]) {
    return map[num];
  }

  // 作为名称
  if (profiles.includes(input)) {
    return input;
  }

  return null;
}

// 获取默认 profile
export function getDefaultProfile() {
  if (fs.existsSync(DEFAULT_FILE)) {
    return fs.readFileSync(DEFAULT_FILE, 'utf-8').trim();
  }
  return null;
}

// 设置默认 profile
export function setDefaultProfile(name) {
  ensureDirs();
  fs.writeFileSync(DEFAULT_FILE, name);
}

// 获取 profile 路径
export function getProfilePath(name) {
  return path.join(PROFILES_DIR, `${name}.json`);
}

// 检查 profile 是否存在
export function profileExists(name) {
  return fs.existsSync(getProfilePath(name));
}

// 获取 Claude 默认 settings 模板
export function getClaudeSettingsTemplate() {
  if (fs.existsSync(CLAUDE_SETTINGS_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    } catch {
      return null;
    }
  }
  return null;
}

function ensureClaudeEnvSettings(envUpdates) {
  const template = getClaudeSettingsTemplate();
  if (!template) {
    return null;
  }

  // 确保 env 对象存在
  if (!template.env || typeof template.env !== 'object' || Array.isArray(template.env)) {
    template.env = {};
  }

  let changed = false;
  for (const [key, value] of Object.entries(envUpdates)) {
    if (template.env[key] !== value) {
      template.env[key] = value;
      changed = true;
    }
  }

  if (changed) {
    // 保存回主配置
    fs.writeFileSync(CLAUDE_SETTINGS_PATH, stringifyClaudeSettings(template));
  }

  return template;
}

// 确保主配置中有 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC 设置
// 如果没有则添加，并返回更新后的模板
export function ensureDisableNonessentialTraffic() {
  return ensureClaudeEnvSettings({ CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' });
}

// 确保主配置中禁用 Attribution Header（Claude Code env 变量）
export function ensureDisableAttributionHeader() {
  return ensureClaudeEnvSettings({ CLAUDE_CODE_ATTRIBUTION_HEADER: '0' });
}

// 一次性确保主配置包含本工具需要的 env 设置
export function ensureRequiredClaudeEnvSettings() {
  return ensureClaudeEnvSettings({
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_ATTRIBUTION_HEADER: '0',
    DISABLE_INSTALLATION_CHECKS: '1',
    CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1'
  });
}

// 获取 statusLine 的 ccline 路径（适配不同操作系统）
function getCclineCommand() {
  const platform = os.platform();
  if (platform === 'win32') {
    return '%USERPROFILE%\\.claude\\ccline\\ccline.exe';
  } else {
    // Linux 和 macOS
    return '~/.claude/ccline/ccline';
  }
}

export function applyClaudeSettingsExtras(target) {
  if (!target || typeof target !== 'object') {
    return false;
  }

  let changed = false;

  // 确保 hasCompletedOnboarding 为 true
  if (target.hasCompletedOnboarding !== true) {
    target.hasCompletedOnboarding = true;
    changed = true;
  }

  // 确保 attribution 禁用（commit/pr 为空字符串）
  if (!target.attribution || typeof target.attribution !== 'object' || Array.isArray(target.attribution)) {
    target.attribution = { commit: '', pr: '' };
    changed = true;
  } else {
    if (target.attribution.commit !== '' || target.attribution.pr !== '') {
      target.attribution.commit = '';
      target.attribution.pr = '';
      changed = true;
    }
  }

  // 兼容旧版本：确保 includeCoAuthoredBy: false
  if (target.includeCoAuthoredBy !== false) {
    target.includeCoAuthoredBy = false;
    changed = true;
  }

  // 确保 statusLine 配置
  const expectedCommand = getCclineCommand();
  const expectedStatusLine = {
    type: 'command',
    command: expectedCommand,
    padding: 0
  };

  if (!target.statusLine ||
      target.statusLine.type !== 'command' ||
      target.statusLine.command !== expectedCommand ||
      target.statusLine.padding !== 0) {
    target.statusLine = expectedStatusLine;
    changed = true;
  }

  return changed;
}

// 确保主配置包含 attribution/includeCoAuthoredBy 和 statusLine 设置
export function ensureClaudeSettingsExtras() {
  const template = getClaudeSettingsTemplate();
  if (!template) {
    return null;
  }

  const changed = applyClaudeSettingsExtras(template);

  if (changed) {
    fs.writeFileSync(CLAUDE_SETTINGS_PATH, stringifyClaudeSettings(template));
  }

  return template;
}

// 读取 profile 配置
export function readProfile(name) {
  const profilePath = getProfilePath(name);
  if (!fs.existsSync(profilePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
  } catch {
    return null;
  }
}

// 保存 profile 配置
export function saveProfile(name, settings) {
  ensureDirs();
  const profilePath = getProfilePath(name);
  fs.writeFileSync(profilePath, stringifyClaudeSettings(settings));
}

// 创建基于主配置的 profile（复制 ~/.claude/settings.json 并设置 env）
export function createProfileFromTemplate(name, apiUrl, apiKey) {
  // 先确保主配置包含必要 env 设置（也会写回 ~/.claude/settings.json）
  const ensuredTemplate = ensureRequiredClaudeEnvSettings();
  const template = ensuredTemplate || getClaudeSettingsTemplate() || {};
  applyClaudeSettingsExtras(template);

  // 确保 env 对象存在
  if (!template.env) {
    template.env = {};
  }

  // 确保 profile 也包含相同设置
  template.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
  template.env.CLAUDE_CODE_ATTRIBUTION_HEADER = '0';
  template.env.DISABLE_INSTALLATION_CHECKS = '1';
  template.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';

  // 只设置 API 凭证到 env
  template.env.ANTHROPIC_AUTH_TOKEN = apiKey;
  template.env.ANTHROPIC_BASE_URL = apiUrl;

  saveProfile(name, template);
  return template;
}

// 同步主配置到 profile（保留 profile 的 API 凭证）
export function syncProfileWithTemplate(name) {
  // 先确保主配置包含必要 env 设置（也会写回 ~/.claude/settings.json）
  const template = ensureRequiredClaudeEnvSettings() || getClaudeSettingsTemplate();
  if (!template) {
    return null;
  }
  applyClaudeSettingsExtras(template);

  const currentProfile = readProfile(name);
  if (!currentProfile) {
    return null;
  }

  // 保存当前 profile 的 API 凭证（支持新旧格式）
  const currentEnv = currentProfile.env || {};
  const apiKey = currentEnv.ANTHROPIC_AUTH_TOKEN || currentProfile.ANTHROPIC_AUTH_TOKEN || '';
  const apiUrl = currentEnv.ANTHROPIC_BASE_URL || currentProfile.ANTHROPIC_BASE_URL || '';

  // 复制主配置
  const newProfile = { ...template };

  // 确保 env 对象存在并保留 API 凭证
  newProfile.env = { ...(template.env || {}), ANTHROPIC_AUTH_TOKEN: apiKey, ANTHROPIC_BASE_URL: apiUrl };

  // 确保 profile 也包含相同设置
  newProfile.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
  newProfile.env.CLAUDE_CODE_ATTRIBUTION_HEADER = '0';
  newProfile.env.DISABLE_INSTALLATION_CHECKS = '1';
  newProfile.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
  applyClaudeSettingsExtras(newProfile);

  saveProfile(name, newProfile);
  return newProfile;
}

// 从 profile 中提取 API 凭证
export function getProfileCredentials(name) {
  const profile = readProfile(name);
  if (!profile) {
    return { apiKey: '', apiUrl: '' };
  }

  // 支持旧格式（直接在顶层）和新格式（在 env 中）
  const env = profile.env || {};
  return {
    apiKey: env.ANTHROPIC_AUTH_TOKEN || profile.ANTHROPIC_AUTH_TOKEN || '',
    apiUrl: env.ANTHROPIC_BASE_URL || profile.ANTHROPIC_BASE_URL || ''
  };
}

// 删除 profile
export function deleteProfile(name) {
  const profilePath = getProfilePath(name);
  if (fs.existsSync(profilePath)) {
    fs.unlinkSync(profilePath);
  }
}

// 清除默认 profile 设置
export function clearDefaultProfile() {
  if (fs.existsSync(DEFAULT_FILE)) {
    fs.unlinkSync(DEFAULT_FILE);
  }
}

// ============================================================
// Codex Profile 管理
// ============================================================

const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const CCC_OPENAI_COMPAT_PROVIDER = 'ccc_openai';

function normalizeBaseUrl(baseUrl) {
  return (baseUrl || '').trim().replace(/\/+$/, '');
}

function isCustomOpenAIBaseUrl(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  return normalized && normalized !== normalizeBaseUrl(OPENAI_DEFAULT_BASE_URL);
}

function extractBaseUrlFromConfigToml(configToml) {
  if (!configToml) return OPENAI_DEFAULT_BASE_URL;
  const baseUrlMatch = configToml.match(/base_url\s*=\s*"([^"]+)"/);
  return baseUrlMatch ? baseUrlMatch[1] : OPENAI_DEFAULT_BASE_URL;
}

function upsertTomlKey(block, key, valueLiteral) {
  const keyPattern = new RegExp(`^\\s*${key}\\s*=\\s*.*$`, 'm');
  if (keyPattern.test(block)) {
    return block.replace(keyPattern, `${key} = ${valueLiteral}`);
  }
  return `${block.trimEnd()}\n${key} = ${valueLiteral}\n`;
}

function ensureCodexOpenAICompatConfig(configToml, baseUrl) {
  if (!isCustomOpenAIBaseUrl(baseUrl)) {
    return configToml;
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  let output = configToml || '# Codex profile managed by ccc\n';
  const firstSectionMatch = output.match(/^\s*\[[^\]]+\]/m);
  const firstSectionIndex = firstSectionMatch && firstSectionMatch.index !== undefined
    ? firstSectionMatch.index
    : output.length;

  let preamble = output.slice(0, firstSectionIndex);
  const rest = output.slice(firstSectionIndex);

  // 如果用户显式指定了非 openai provider，尊重用户配置，不自动覆盖
  const providerMatch = preamble.match(/^\s*model_provider\s*=\s*"([^"]+)"/m);
  if (providerMatch && !['openai', CCC_OPENAI_COMPAT_PROVIDER].includes(providerMatch[1])) {
    return output;
  }

  if (providerMatch) {
    preamble = preamble.replace(
      /^\s*model_provider\s*=\s*"([^"]+)"/m,
      `model_provider = "${CCC_OPENAI_COMPAT_PROVIDER}"`
    );
  } else {
    preamble = `${preamble.replace(/\s*$/, '\n')}model_provider = "${CCC_OPENAI_COMPAT_PROVIDER}"\n`;
  }

  if (rest.trim()) {
    output = `${preamble.trimEnd()}\n\n${rest.replace(/^\s*/, '')}`;
  } else {
    output = `${preamble.trimEnd()}\n`;
  }

  const sectionPattern = new RegExp(
    `\\[model_providers\\.${CCC_OPENAI_COMPAT_PROVIDER}\\][\\s\\S]*?(?=\\n\\[|$)`
  );

  if (sectionPattern.test(output)) {
    output = output.replace(sectionPattern, (section) => {
      let next = section;
      next = upsertTomlKey(next, 'name', '"OpenAI Compatible"');
      next = upsertTomlKey(next, 'base_url', `"${normalizedBaseUrl}"`);
      next = upsertTomlKey(next, 'wire_api', '"responses"');
      next = upsertTomlKey(next, 'requires_openai_auth', 'true');
      return next.trimEnd();
    });
  } else {
    output = `${output.trimEnd()}\n\n[model_providers.${CCC_OPENAI_COMPAT_PROVIDER}]\nname = "OpenAI Compatible"\nbase_url = "${normalizedBaseUrl}"\nwire_api = "responses"\nrequires_openai_auth = true\n`;
  }

  return `${output.trimEnd()}\n`;
}

// 获取 Codex profile 目录路径
export function getCodexProfileDir(name) {
  return path.join(CODEX_PROFILES_DIR, name);
}

// 检查 Codex profile 是否存在
export function codexProfileExists(name) {
  const dir = getCodexProfileDir(name);
  return fs.existsSync(path.join(dir, 'auth.json'));
}

// 获取所有 Codex profiles（按 a-z 排序）
export function getCodexProfiles() {
  ensureDirs();
  if (!fs.existsSync(CODEX_PROFILES_DIR)) return [];
  return fs.readdirSync(CODEX_PROFILES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(CODEX_PROFILES_DIR, d.name, 'auth.json')))
    .map(d => d.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN', { sensitivity: 'base' }));
}

// 读取 Codex profile
export function readCodexProfile(name) {
  const dir = getCodexProfileDir(name);
  const authPath = path.join(dir, 'auth.json');
  const configPath = path.join(dir, 'config.toml');

  if (!fs.existsSync(authPath)) return null;

  try {
    const auth = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
    const configToml = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : '';
    return { auth, configToml };
  } catch {
    return null;
  }
}

// 保存 Codex profile
export function saveCodexProfile(name, auth, configToml) {
  ensureDirs();
  const dir = getCodexProfileDir(name);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(path.join(dir, 'auth.json'), JSON.stringify(auth, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'config.toml'), configToml);
}

// 生成 Codex config.toml 内容
export function generateCodexConfigToml(baseUrl, model) {
  let lines = ['# Codex profile managed by ccc'];
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl) || OPENAI_DEFAULT_BASE_URL;

  if (model) {
    lines.push(`model = "${model}"`);
  }

  if (isCustomOpenAIBaseUrl(normalizedBaseUrl)) {
    lines.push(`model_provider = "${CCC_OPENAI_COMPAT_PROVIDER}"`);
    lines.push('');
    lines.push(`[model_providers.${CCC_OPENAI_COMPAT_PROVIDER}]`);
    lines.push('name = "OpenAI Compatible"');
    lines.push(`base_url = "${normalizedBaseUrl}"`);
    lines.push('wire_api = "responses"');
    lines.push('requires_openai_auth = true');
  }

  lines.push('');
  return lines.join('\n');
}

// 创建 Codex profile
export function createCodexProfile(name, apiKey, baseUrl, model) {
  const auth = {
    auth_mode: 'apikey',
    OPENAI_API_KEY: apiKey
  };
  const configToml = generateCodexConfigToml(baseUrl, model);
  saveCodexProfile(name, auth, configToml);
  return { auth, configToml };
}

// 获取 Codex profile 的凭证
export function getCodexProfileCredentials(name) {
  const profile = readCodexProfile(name);
  if (!profile) return { apiKey: '', baseUrl: '', model: '' };

  const apiKey = profile.auth?.OPENAI_API_KEY || '';

  // 从 config.toml 解析 base_url 和 model
  let baseUrl = '';
  let model = '';
  if (profile.configToml) {
    const baseUrlMatch = profile.configToml.match(/base_url\s*=\s*"([^"]+)"/);
    if (baseUrlMatch) baseUrl = baseUrlMatch[1];
    const modelMatch = profile.configToml.match(/^model\s*=\s*"([^"]+)"/m);
    if (modelMatch) model = modelMatch[1];
  }

  return { apiKey, baseUrl: baseUrl || OPENAI_DEFAULT_BASE_URL, model: model || '' };
}

// 删除 Codex profile
export function deleteCodexProfile(name) {
  const dir = getCodexProfileDir(name);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
}

// 同步 Codex profile（从 ~/.codex/ 模板同步，保留 API 凭证）
export function syncCodexProfileWithTemplate(name) {
  const templateConfigPath = path.join(CODEX_HOME_PATH, 'config.toml');
  if (!fs.existsSync(templateConfigPath)) return null;

  const current = readCodexProfile(name);
  if (!current) return null;

  // 读取模板 config.toml
  let templateConfig = fs.readFileSync(templateConfigPath, 'utf-8');

  // 保留当前 profile 的 base_url 和 model
  const { baseUrl, model } = getCodexProfileCredentials(name);

  if (model) {
    if (templateConfig.match(/^model\s*=/m)) {
      templateConfig = templateConfig.replace(/^model\s*=\s*"[^"]*"/m, `model = "${model}"`);
    } else {
      templateConfig = `model = "${model}"\n` + templateConfig;
    }
  }

  // 对第三方 base_url 自动补齐 provider 兼容配置，避免依赖 OPENAI_BASE_URL 环境变量
  templateConfig = ensureCodexOpenAICompatConfig(templateConfig, baseUrl);

  saveCodexProfile(name, current.auth, templateConfig);
  return { auth: current.auth, configToml: templateConfig };
}

// 应用 Claude profile 到 ~/.claude/settings.json
export function applyClaudeProfile(name) {
  const profile = readProfile(name);
  if (!profile) return false;
  fs.writeFileSync(CLAUDE_SETTINGS_PATH, stringifyClaudeSettings(profile));
  return true;
}

// 应用 Codex profile 到 ~/.codex/
export function applyCodexProfile(name) {
  const profile = readCodexProfile(name);
  if (!profile) return false;

  if (!fs.existsSync(CODEX_HOME_PATH)) {
    fs.mkdirSync(CODEX_HOME_PATH, { recursive: true });
  }

  // 写入 auth.json
  fs.writeFileSync(
    path.join(CODEX_HOME_PATH, 'auth.json'),
    JSON.stringify(profile.auth, null, 2) + '\n'
  );

  // 写入 config.toml（如果有内容）
  if (profile.configToml && profile.configToml.trim()) {
    const baseUrl = extractBaseUrlFromConfigToml(profile.configToml);
    const compatConfig = ensureCodexOpenAICompatConfig(profile.configToml, baseUrl);
    fs.writeFileSync(path.join(CODEX_HOME_PATH, 'config.toml'), compatConfig);
  }

  return true;
}

// ============================================================
// 统一 Profile 管理（Claude + Codex 混合）
// ============================================================

// 获取所有 profiles（混合 Claude 和 Codex），按名称排序
export function getAllProfiles() {
  const claudeProfiles = getProfiles().map(name => ({ name, type: 'claude' }));
  const codexProfiles = getCodexProfiles().map(name => ({ name, type: 'codex' }));
  return [...claudeProfiles, ...codexProfiles]
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { sensitivity: 'base' }));
}

// 根据序号或名称解析 profile（统一）
export function resolveAnyProfile(input) {
  const all = getAllProfiles();
  const map = {};
  all.forEach((p, i) => { map[i + 1] = p; });

  // 尝试作为数字序号
  const num = parseInt(input, 10);
  if (!isNaN(num) && map[num]) {
    return map[num];
  }

  // 作为名称查找
  const found = all.find(p => p.name === input);
  return found || null;
}

// 检查任意类型 profile 是否存在
export function anyProfileExists(name) {
  if (profileExists(name)) return { exists: true, type: 'claude' };
  if (codexProfileExists(name)) return { exists: true, type: 'codex' };
  return { exists: false, type: null };
}
