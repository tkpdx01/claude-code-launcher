// Profile CRUD — new slim format + old format auto-migration

import fs from 'fs';
import path from 'path';
import {
  CONFIG_DIR,
  PROFILES_DIR,
  CODEX_PROFILES_DIR,
} from './config.js';

// ---- Directory setup ----

export function ensureDirs() {
  for (const dir of [CONFIG_DIR, PROFILES_DIR, CODEX_PROFILES_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

// ---- Claude profiles ----

function claudePath(name) {
  return path.join(PROFILES_DIR, `${name}.json`);
}

export function claudeProfileExists(name) {
  return fs.existsSync(claudePath(name));
}

function getClaudeNames() {
  ensureDirs();
  return fs
    .readdirSync(PROFILES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', ''))
    .sort((a, b) => a.localeCompare(b, 'zh-CN', { sensitivity: 'base' }));
}

// Parse profile from raw JSON — handles both old (full settings.json) and new (slim) formats.
// Returns normalized shape: { type, apiUrl, apiKey, env?, settings? }
// Does NOT write to disk — callers decide whether to persist.
function parseClaudeProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  // New format: has "type" field
  if (raw.type === 'claude') return raw;
  // Old format: full settings.json copy with env.ANTHROPIC_AUTH_TOKEN
  if (raw.env?.ANTHROPIC_AUTH_TOKEN) {
    const { env = {}, ...restSettings } = raw;
    const { ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL, ...restEnv } = env;
    const result = {
      type: 'claude',
      apiUrl: ANTHROPIC_BASE_URL || '',
      apiKey: ANTHROPIC_AUTH_TOKEN || '',
    };
    // Preserve extra env vars from old profile
    const filteredEnv = Object.fromEntries(
      Object.entries(restEnv).filter(([k]) => !k.startsWith('CLAUDE_CODE_') && !k.startsWith('DISABLE_')),
    );
    if (Object.keys(filteredEnv).length > 0) result.env = filteredEnv;
    if (Object.keys(restSettings).length > 0) result.settings = restSettings;
    return result;
  }
  // Unknown but has apiKey (partially migrated?)
  if (raw.apiKey !== undefined) return { type: 'claude', ...raw };
  return null;
}

export function readClaudeProfile(name) {
  const p = claudePath(name);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return parseClaudeProfile(raw);
  } catch {
    return null;
  }
}

// Check if a profile is still in old (full settings.json) format on disk
export function isOldFormatProfile(name) {
  const p = claudePath(name);
  if (!fs.existsSync(p)) return false;
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return raw.env?.ANTHROPIC_AUTH_TOKEN && !raw.type;
  } catch {
    return false;
  }
}

export function saveClaudeProfile(name, profile) {
  ensureDirs();
  const data = { type: 'claude', ...profile };
  fs.writeFileSync(claudePath(name), JSON.stringify(data, null, 2) + '\n');
}

export function deleteClaudeProfile(name) {
  const p = claudePath(name);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

export function getClaudeCredentials(name) {
  const profile = readClaudeProfile(name);
  if (!profile) return { apiKey: '', apiUrl: '' };
  return {
    apiKey: profile.apiKey || '',
    apiUrl: profile.apiUrl || '',
  };
}

// ---- Codex profiles ----

const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const CCC_OPENAI_COMPAT_PROVIDER = 'ccc_openai';

function codexDir(name) {
  return path.join(CODEX_PROFILES_DIR, name);
}

export function codexProfileExists(name) {
  return fs.existsSync(path.join(codexDir(name), 'auth.json'));
}

function getCodexNames() {
  ensureDirs();
  if (!fs.existsSync(CODEX_PROFILES_DIR)) return [];
  return fs
    .readdirSync(CODEX_PROFILES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(CODEX_PROFILES_DIR, d.name, 'auth.json')))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN', { sensitivity: 'base' }));
}

export function readCodexProfile(name) {
  const dir = codexDir(name);
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

export function saveCodexProfile(name, auth, configToml) {
  ensureDirs();
  const dir = codexDir(name);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'auth.json'), JSON.stringify(auth, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'config.toml'), configToml);
}

export function deleteCodexProfile(name) {
  const dir = codexDir(name);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
}

export function getCodexCredentials(name) {
  const profile = readCodexProfile(name);
  if (!profile) return { apiKey: '', baseUrl: '', model: '' };
  const apiKey = profile.auth?.OPENAI_API_KEY || '';
  let baseUrl = '';
  let model = '';
  if (profile.configToml) {
    const bm = profile.configToml.match(/base_url\s*=\s*"([^"]+)"/);
    if (bm) baseUrl = bm[1];
    const mm = profile.configToml.match(/^model\s*=\s*"([^"]+)"/m);
    if (mm) model = mm[1];
  }
  return { apiKey, baseUrl: baseUrl || OPENAI_DEFAULT_BASE_URL, model };
}

function normalizeBaseUrl(baseUrl) {
  return (baseUrl || '').trim().replace(/\/+$/, '');
}

function isCustomOpenAIBaseUrl(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  return normalized && normalized !== normalizeBaseUrl(OPENAI_DEFAULT_BASE_URL);
}

export function generateCodexConfigToml(baseUrl, model) {
  const lines = ['# Codex profile managed by ccc'];
  lines.push('analytics = false');
  const normalized = normalizeBaseUrl(baseUrl) || OPENAI_DEFAULT_BASE_URL;
  if (model) lines.push(`model = "${model}"`);
  if (isCustomOpenAIBaseUrl(normalized)) {
    lines.push(`model_provider = "${CCC_OPENAI_COMPAT_PROVIDER}"`);
    lines.push('');
    lines.push(`[model_providers.${CCC_OPENAI_COMPAT_PROVIDER}]`);
    lines.push('name = "OpenAI Compatible"');
    lines.push(`base_url = "${normalized}"`);
    lines.push('wire_api = "responses"');
    lines.push('requires_openai_auth = true');
  }
  lines.push('');
  return lines.join('\n');
}

export function createCodexProfile(name, apiKey, baseUrl, model) {
  const auth = { auth_mode: 'apikey', OPENAI_API_KEY: apiKey };
  const configToml = generateCodexConfigToml(baseUrl, model);
  saveCodexProfile(name, auth, configToml);
}

// ---- Unified (Claude + Codex) ----

export function getAllProfiles() {
  const claude = getClaudeNames().map((name) => ({ name, type: 'claude' }));
  const codex = getCodexNames().map((name) => ({ name, type: 'codex' }));
  return [...claude, ...codex].sort((a, b) =>
    a.name.localeCompare(b.name, 'zh-CN', { sensitivity: 'base' }),
  );
}

export function resolveProfile(input) {
  const all = getAllProfiles();
  const byName = all.find((p) => p.name === input);
  if (byName) return byName;
  // Try as numeric index (1-based)
  const num = parseInt(input, 10);
  if (!isNaN(num) && num >= 1 && num <= all.length) {
    return all[num - 1];
  }
  return null;
}

export function anyProfileExists(name) {
  if (claudeProfileExists(name)) return { exists: true, type: 'claude' };
  if (codexProfileExists(name)) return { exists: true, type: 'codex' };
  return { exists: false, type: null };
}

// ---- Codex profile dir path (for CODEX_HOME) ----

export function getCodexProfileDir(name) {
  return codexDir(name);
}
