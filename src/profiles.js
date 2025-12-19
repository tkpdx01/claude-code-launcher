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

