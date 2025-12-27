import fs from 'fs';
import path from 'path';
import { CONFIG_DIR, PROFILES_DIR, DEFAULT_FILE, CLAUDE_SETTINGS_PATH } from './config.js';

// 确保目录存在
export function ensureDirs() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!fs.existsSync(PROFILES_DIR)) {
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
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

// 确保主配置中有 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC 设置
// 如果没有则添加，并返回更新后的模板
export function ensureDisableNonessentialTraffic() {
  const template = getClaudeSettingsTemplate();
  if (!template) {
    return null;
  }

  // 确保 env 对象存在
  if (!template.env) {
    template.env = {};
  }

  // 检查是否已有该设置
  if (template.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC !== '1') {
    template.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
    // 保存回主配置
    fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(template, null, 2));
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
  fs.writeFileSync(profilePath, JSON.stringify(settings, null, 2));
}

// 创建基于主配置的 profile（复制 ~/.claude/settings.json 并设置 env）
export function createProfileFromTemplate(name, apiUrl, apiKey) {
  // 先确保主配置有 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC 设置
  ensureDisableNonessentialTraffic();

  const template = getClaudeSettingsTemplate() || {};

  // 确保 env 对象存在
  if (!template.env) {
    template.env = {};
  }

  // 只设置 API 凭证到 env
  template.env.ANTHROPIC_AUTH_TOKEN = apiKey;
  template.env.ANTHROPIC_BASE_URL = apiUrl;

  saveProfile(name, template);
  return template;
}

// 同步主配置到 profile（保留 profile 的 API 凭证）
export function syncProfileWithTemplate(name) {
  // 先确保主配置有 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC 设置
  ensureDisableNonessentialTraffic();

  const template = getClaudeSettingsTemplate();
  if (!template) {
    return null;
  }

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

