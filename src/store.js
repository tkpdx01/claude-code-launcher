// Profile CRUD — new slim format + old format auto-migration

import fs from 'fs';
import path from 'path';
import { tomlString, readTomlString, fixCodexAnalyticsScope } from './codex-config.js';
import {
  CONFIG_DIR,
  PROFILES_DIR,
  CODEX_PROFILES_DIR,
  CODEX_HOME_PATH,
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

function readProfileJson(name) {
  const p = claudePath(name);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return raw && typeof raw === 'object' ? raw : null;
  } catch {
    return null;
  }
}

export function claudeProfileExists(name) {
  return readClaudeProfile(name) != null;
}

function getClaudeNames() {
  ensureDirs();
  return fs
    .readdirSync(PROFILES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .filter((name) => readClaudeProfile(name) != null)
    .sort((a, b) => a.localeCompare(b, 'zh-CN', { sensitivity: 'base' }));
}

// Parse profile from raw JSON — handles both old (full settings.json) and new (slim) formats.
// Returns normalized shape: { type, apiUrl, apiKey, env?, settings?, model? }
// Does NOT write to disk — callers decide whether to persist.
function parseClaudeProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.type === 'codex') return null;
  if (raw.type === 'claude' || raw.type === 'deepseek') return raw;
  if (raw.type) return null;
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

function parseJsonCodexProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.type === 'codex') return raw;
  return null;
}

function readJsonCodexProfile(name) {
  return parseJsonCodexProfile(readProfileJson(name));
}

export function readClaudeProfile(name) {
  return parseClaudeProfile(readProfileJson(name));
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
const GPT_55_MODEL = 'gpt-5.5';
const GPT_55_CATALOG_FILE = 'model-catalog.gpt-5.5.json';

function codexDir(name) {
  return path.join(CODEX_PROFILES_DIR, name);
}

function codexDirExists(name) {
  return fs.existsSync(path.join(codexDir(name), 'auth.json'));
}

export function codexProfileExists(name) {
  return codexDirExists(name) || readJsonCodexProfile(name) != null;
}

function getCodexNames() {
  ensureDirs();
  const names = new Set();
  if (fs.existsSync(CODEX_PROFILES_DIR)) {
    for (const entry of fs.readdirSync(CODEX_PROFILES_DIR, { withFileTypes: true })) {
      if (entry.isDirectory() && codexDirExists(entry.name)) names.add(entry.name);
    }
  }
  for (const file of fs.readdirSync(PROFILES_DIR)) {
    if (!file.endsWith('.json')) continue;
    const name = file.slice(0, -5);
    if (readJsonCodexProfile(name)) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'zh-CN', { sensitivity: 'base' }));
}

export function materializeJsonCodexProfile(name) {
  if (codexDirExists(name)) return false;
  const slim = readJsonCodexProfile(name);
  if (!slim?.apiKey) return false;
  createCodexProfile(name, slim.apiKey, slim.apiUrl || OPENAI_DEFAULT_BASE_URL, slim.model || '');
  return true;
}

export function readCodexProfile(name) {
  materializeJsonCodexProfile(name);
  const dir = codexDir(name);
  const authPath = path.join(dir, 'auth.json');
  const configPath = path.join(dir, 'config.toml');
  if (!fs.existsSync(authPath)) return null;
  try {
    const auth = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
    const configToml = fs.existsSync(configPath)
      ? sanitizeCodexConfigToml(fs.readFileSync(configPath, 'utf-8'))
      : '';
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
  fs.writeFileSync(path.join(dir, 'config.toml'), sanitizeCodexConfigToml(configToml));
  if (readJsonCodexProfile(name)) fs.unlinkSync(claudePath(name));
}

export function deleteCodexProfile(name) {
  const dir = codexDir(name);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
  if (readJsonCodexProfile(name)) fs.unlinkSync(claudePath(name));
}

export function getCodexCredentials(name) {
  if (codexDirExists(name)) {
    const profile = readCodexProfile(name);
    if (!profile) return { apiKey: '', baseUrl: '', model: '' };
    const apiKey = profile.auth?.OPENAI_API_KEY || '';
    let baseUrl = '';
    let model = '';
    if (profile.configToml) {
      baseUrl = readTomlString(profile.configToml, 'base_url');
      model = readTomlString(profile.configToml, 'model');
    }
    return { apiKey, baseUrl: baseUrl || OPENAI_DEFAULT_BASE_URL, model };
  }
  const slim = readJsonCodexProfile(name);
  if (slim) {
    return {
      apiKey: slim.apiKey || '',
      baseUrl: slim.apiUrl || OPENAI_DEFAULT_BASE_URL,
      model: slim.model || '',
    };
  }
  return { apiKey: '', baseUrl: '', model: '' };
}

function normalizeBaseUrl(baseUrl) {
  return (baseUrl || '').trim().replace(/\/+$/, '');
}

function isCustomOpenAIBaseUrl(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  return normalized && normalized !== normalizeBaseUrl(OPENAI_DEFAULT_BASE_URL);
}

function isGpt55Model(model) {
  return (model || '').trim().toLowerCase() === GPT_55_MODEL;
}

export function generateCodexConfigToml(baseUrl, model) {
  const lines = ['# Codex profile managed by ccc'];
  const normalized = normalizeBaseUrl(baseUrl) || OPENAI_DEFAULT_BASE_URL;
  if (model) lines.push(`model = ${tomlString(model)}`);
  if (isCustomOpenAIBaseUrl(normalized)) {
    lines.push(`model_provider = "${CCC_OPENAI_COMPAT_PROVIDER}"`);
  }
  lines.push('', '[analytics]', 'enabled = false');
  if (isCustomOpenAIBaseUrl(normalized)) {
    lines.push('');
    lines.push(`[model_providers.${CCC_OPENAI_COMPAT_PROVIDER}]`);
    lines.push('name = "OpenAI Compatible"');
    lines.push(`base_url = ${tomlString(normalized)}`);
    lines.push('env_key = "OPENAI_API_KEY"');
    lines.push('wire_api = "responses"');
  }
  lines.push('');
  return lines.join('\n');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findFirstTomlSection(lines) {
  const idx = lines.findIndex((line) => /^\s*\[[^\]]+\]\s*(?:#.*)?$/.test(line));
  return idx >= 0 ? idx : lines.length;
}

function updateRootKey(configToml, key, value) {
  const newline = configToml.includes('\r\n') ? '\r\n' : '\n';
  const lines = configToml.split(/\r?\n/);
  const firstSection = findFirstTomlSection(lines);
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
  let found = false;
  const next = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (i < firstSection && keyPattern.test(lines[i])) {
      found = true;
      if (value !== null) next.push(`${key} = ${value}`);
      continue;
    }
    next.push(lines[i]);
  }

  if (!found && value !== null) {
    let insertAt = firstSection;
    while (insertAt > 0 && next[insertAt - 1]?.trim() === '') insertAt -= 1;
    next.splice(insertAt, 0, `${key} = ${value}`);
  }

  return next.join(newline);
}

function updateTomlSection(configToml, sectionName, updateBody) {
  const newline = configToml.includes('\r\n') ? '\r\n' : '\n';
  const lines = configToml.split(/\r?\n/);
  const headerPattern = new RegExp(`^\\s*\\[${escapeRegExp(sectionName)}\\]\\s*(?:#.*)?$`);
  const start = lines.findIndex((line) => headerPattern.test(line));

  if (start < 0) {
    const body = updateBody([]);
    return [
      configToml.trimEnd(),
      '',
      `[${sectionName}]`,
      ...body,
      '',
    ].join(newline);
  }

  let end = start + 1;
  while (end < lines.length && !/^\s*\[[^\]]+\]\s*(?:#.*)?$/.test(lines[end])) end += 1;

  const body = updateBody(lines.slice(start + 1, end));
  lines.splice(start + 1, end - start - 1, ...body);
  return lines.join(newline);
}

function upsertBodyKey(lines, key, value) {
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
  const idx = lines.findIndex((line) => keyPattern.test(line));
  if (idx >= 0) {
    lines[idx] = `${key} = ${value}`;
  } else {
    let insertAt = lines.length;
    while (insertAt > 0 && lines[insertAt - 1]?.trim() === '') insertAt -= 1;
    lines.splice(insertAt, 0, `${key} = ${value}`);
  }
}

function updateCodexProviderConfig(configToml, baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl) || OPENAI_DEFAULT_BASE_URL;
  if (!isCustomOpenAIBaseUrl(normalized)) return configToml;

  return updateTomlSection(configToml, `model_providers.${CCC_OPENAI_COMPAT_PROVIDER}`, (body) => {
    const next = [...body].filter((line) => !/^\s*requires_openai_auth\s*=/.test(line));
    upsertBodyKey(next, 'name', '"OpenAI Compatible"');
    upsertBodyKey(next, 'base_url', tomlString(normalized));
    upsertBodyKey(next, 'env_key', '"OPENAI_API_KEY"');
    upsertBodyKey(next, 'wire_api', '"responses"');
    return next;
  });
}

function updateCodexConfigToml(configToml, baseUrl, model) {
  let next = fixCodexAnalyticsScope(sanitizeCodexConfigToml(configToml || ''));
  if (!next.trim()) return generateCodexConfigToml(baseUrl, model);

  const normalized = normalizeBaseUrl(baseUrl) || OPENAI_DEFAULT_BASE_URL;
  next = updateRootKey(next, 'model', model ? tomlString(model) : null);
  next = updateRootKey(
    next,
    'model_provider',
    isCustomOpenAIBaseUrl(normalized) ? `"${CCC_OPENAI_COMPAT_PROVIDER}"` : null,
  );
  next = updateCodexProviderConfig(next, normalized);
  return sanitizeCodexConfigToml(next);
}

export function sanitizeCodexConfigToml(configToml = '') {
  const newline = configToml.includes('\r\n') ? '\r\n' : '\n';
  const lines = configToml.split(/\r?\n/);
  const filtered = lines.filter((line) => (
    !/^\s*sandbox(?:_mode|_permissions)?\s*=/.test(line)
  ));
  return removeEmptyTomlSection(filtered, 'windows').join(newline);
}

function removeEmptyTomlSection(lines, sectionName) {
  const result = [];
  for (let i = 0; i < lines.length;) {
    const header = lines[i].match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
    if (!header || header[1].trim().toLowerCase() !== sectionName) {
      result.push(lines[i]);
      i += 1;
      continue;
    }

    let j = i + 1;
    const body = [];
    while (j < lines.length && !/^\s*\[[^\]]+\]\s*(?:#.*)?$/.test(lines[j])) {
      body.push(lines[j]);
      j += 1;
    }

    const hasContent = body.some((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('#');
    });
    if (hasContent) {
      result.push(lines[i], ...body);
    }
    i = j;
  }
  return result;
}

export function sanitizeCodexProfileConfig(name) {
  const configPath = path.join(codexDir(name), 'config.toml');
  if (!fs.existsSync(configPath)) return;

  const original = fs.readFileSync(configPath, 'utf-8');
  const sanitized = sanitizeCodexConfigToml(original);
  if (sanitized !== original) {
    fs.writeFileSync(configPath, sanitized);
  }
}

function ensureGpt55CatalogFile(name) {
  const target = path.join(codexDir(name), GPT_55_CATALOG_FILE);
  if (fs.existsSync(target)) return true;

  const source = path.join(CODEX_HOME_PATH, GPT_55_CATALOG_FILE);
  if (!fs.existsSync(source)) return false;

  if (!fs.existsSync(path.dirname(target))) fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return true;
}

function ensureCodexModelCapabilities(name, configToml, model) {
  if (!isGpt55Model(model)) return configToml;

  let next = configToml;
  next = updateRootKey(next, 'model_reasoning_effort', '"xhigh"');
  if (ensureGpt55CatalogFile(name)) {
    next = updateRootKey(next, 'model_catalog_json', `'.\\${GPT_55_CATALOG_FILE}'`);
  }
  return next;
}

export function copyCodexProfileSupportFiles(name, targetDir) {
  const dir = codexDir(name);
  if (!fs.existsSync(dir) || !fs.existsSync(targetDir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && /^model-catalog.*\.json$/i.test(entry.name)) {
      fs.copyFileSync(path.join(dir, entry.name), path.join(targetDir, entry.name));
    }
  }
}

export function createCodexProfile(name, apiKey, baseUrl, model) {
  const auth = { auth_mode: 'apikey', OPENAI_API_KEY: apiKey };
  const configToml = ensureCodexModelCapabilities(
    name,
    generateCodexConfigToml(baseUrl, model),
    model,
  );
  saveCodexProfile(name, auth, configToml);
}

export function updateCodexProfile(name, apiKey, baseUrl, model) {
  const existing = readCodexProfile(name);
  const auth = { auth_mode: 'apikey', OPENAI_API_KEY: apiKey };
  const baseConfig = existing?.configToml || '';
  const configToml = ensureCodexModelCapabilities(
    name,
    updateCodexConfigToml(baseConfig, baseUrl, model),
    model,
  );
  saveCodexProfile(name, auth, configToml);
}

// ---- Unified (Claude + Codex) ----

export function getAllProfiles() {
  const claude = getClaudeNames().map((name) => {
    const profile = readClaudeProfile(name);
    const type = profile?.type === 'deepseek' ? 'deepseek' : 'claude';
    return { name, type };
  });
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
  const num = /^\d+$/.test(input) ? Number(input) : NaN;
  if (Number.isSafeInteger(num) && num >= 1 && num <= all.length) {
    return all[num - 1];
  }
  return null;
}

export function anyProfileExists(name) {
  const claude = readClaudeProfile(name);
  if (claude) {
    const type = claude.type === 'deepseek' ? 'deepseek' : 'claude';
    return { exists: true, type };
  }
  if (codexProfileExists(name)) return { exists: true, type: 'codex' };
  return { exists: false, type: null };
}

// ---- Codex profile dir path (for CODEX_HOME) ----

export function getCodexProfileDir(name) {
  return codexDir(name);
}
