// Profile CRUD — new slim format + old format auto-migration

import fs from 'fs';
import path from 'path';
import {
  tomlString,
  readTomlString,
  fixCodexAnalyticsScope,
  fixReservedProviderName,
} from './codex-config.js';
import { OPENAI_DEFAULT_BASE_URL } from './providers.js';
import { isSafeProfileName } from './profile-name.js';
import {
  CONFIG_DIR,
  PROFILES_DIR,
  CODEX_PROFILES_DIR,
  CODEX_HOME_PATH,
} from './config.js';

// One collator for every sort: String#localeCompare(locale) builds a new one per call.
const collator = new Intl.Collator('zh-CN', { sensitivity: 'base' });
const byName = (a, b) => collator.compare(a, b);

// ---- Directory setup ----

export function ensureDirs() {
  for (const dir of [CONFIG_DIR, PROFILES_DIR, CODEX_PROFILES_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ---- Shared file helpers ----

const MISSING_FILE = new Set(['ENOENT', 'ENOTDIR', 'EISDIR']);

// Returns null for a missing file; callers treat that like "no profile".
function readText(file) {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch (err) {
    if (MISSING_FILE.has(err.code)) return null;
    throw err;
  }
}

// Unreadable or malformed JSON is skipped like a missing profile.
function readJsonObject(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return raw && typeof raw === 'object' ? raw : null;
  } catch {
    return null;
  }
}

// ---- Claude profiles ----

function claudePath(name) {
  return path.join(PROFILES_DIR, `${name}.json`);
}

function readProfileJson(name) {
  return readJsonObject(claudePath(name));
}

export function claudeProfileExists(name) {
  return readClaudeProfile(name) != null;
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

export function saveClaudeProfile(name, profile) {
  ensureDirs();
  const data = { type: 'claude', ...profile };
  fs.writeFileSync(claudePath(name), JSON.stringify(data, null, 2) + '\n');
}

export function deleteClaudeProfile(name) {
  fs.rmSync(claudePath(name), { force: true });
}

// ---- Codex profiles ----

const CCC_OPENAI_COMPAT_PROVIDER = 'ccc_openai';
const GPT_55_MODEL = 'gpt-5.5';
const GPT_55_CATALOG_FILE = 'model-catalog.gpt-5.5.json';

function codexDir(name) {
  return path.join(CODEX_PROFILES_DIR, name);
}

function codexAuthPath(name) {
  return path.join(codexDir(name), 'auth.json');
}

function codexConfigPath(name) {
  return path.join(codexDir(name), 'config.toml');
}

function codexDirExists(name) {
  return fs.existsSync(codexAuthPath(name));
}

export function codexProfileExists(name) {
  return codexDirExists(name) || readJsonCodexProfile(name) != null;
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
  const auth = readJsonObject(codexAuthPath(name));
  if (!auth) return null;
  const configToml = readText(codexConfigPath(name));
  return { auth, configToml: configToml === null ? '' : sanitizeCodexConfigToml(configToml) };
}

export function saveCodexProfile(name, auth, configToml) {
  ensureDirs();
  fs.mkdirSync(codexDir(name), { recursive: true });
  fs.writeFileSync(codexAuthPath(name), JSON.stringify(auth, null, 2) + '\n');
  fs.writeFileSync(codexConfigPath(name), sanitizeCodexConfigToml(configToml));
  if (readJsonCodexProfile(name)) fs.unlinkSync(claudePath(name));
}

export function deleteCodexProfile(name) {
  fs.rmSync(codexDir(name), { recursive: true, force: true });
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

const TOML_SECTION_HEADER = /^\s*\[[^\]]+\]\s*(?:#.*)?$/;

function findFirstTomlSection(lines) {
  const idx = lines.findIndex((line) => TOML_SECTION_HEADER.test(line));
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
  while (end < lines.length && !TOML_SECTION_HEADER.test(lines[end])) end += 1;

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
    const next = body.filter((line) => !/^\s*requires_openai_auth\s*=/.test(line));
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
    while (j < lines.length && !TOML_SECTION_HEADER.test(lines[j])) {
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

// Bring an on-disk Codex profile config up to date in a single read/write:
// drop obsolete sandbox keys, move misplaced [analytics] root keys, and
// rename the reserved "openai" provider. Returns what changed.
export function repairCodexProfileConfig(name) {
  const configPath = codexConfigPath(name);
  const original = readText(configPath);
  if (original === null) return { changed: false, renamedProvider: false };

  const upstream = fixCodexAnalyticsScope(sanitizeCodexConfigToml(original));
  const repaired = fixReservedProviderName(upstream);
  const changed = repaired !== original;
  if (changed) fs.writeFileSync(configPath, repaired);
  return { changed, renamedProvider: repaired !== upstream };
}

function ensureGpt55CatalogFile(name) {
  const target = path.join(codexDir(name), GPT_55_CATALOG_FILE);
  if (fs.existsSync(target)) return true;

  const source = path.join(CODEX_HOME_PATH, GPT_55_CATALOG_FILE);
  if (!fs.existsSync(source)) return false;

  fs.mkdirSync(path.dirname(target), { recursive: true });
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

// One pass over both profile directories; every JSON file is read and parsed
// exactly once. Entries carry the parsed JSON so callers can show details
// without touching the disk again.
function scanProfiles() {
  ensureDirs();
  const claude = [];
  const codex = new Map();

  for (const file of fs.readdirSync(PROFILES_DIR)) {
    if (!file.endsWith('.json')) continue;
    const name = file.slice(0, -5);
    const raw = readProfileJson(name);
    if (!raw) continue;
    const slimCodex = parseJsonCodexProfile(raw);
    if (slimCodex) {
      codex.set(name, { name, type: 'codex', json: slimCodex });
      continue;
    }
    const profile = parseClaudeProfile(raw);
    if (profile) {
      claude.push({ name, type: profile.type === 'deepseek' ? 'deepseek' : 'claude', json: profile });
    }
  }

  for (const entry of fs.readdirSync(CODEX_PROFILES_DIR, { withFileTypes: true })) {
    // A materialized directory wins over a slim JSON file of the same name.
    if (entry.isDirectory() && codexDirExists(entry.name)) {
      codex.set(entry.name, { name: entry.name, type: 'codex', json: null });
    }
  }

  return [...claude, ...codex.values()].sort((a, b) => byName(a.name, b.name));
}

export function getAllProfiles() {
  return scanProfiles().map(({ name, type }) => ({ name, type }));
}

// Listing view: endpoint per profile without re-reading the JSON files.
export function getProfileSummaries() {
  return scanProfiles().map(({ name, type, json }) => {
    let url = '';
    if (type !== 'codex') {
      url = json.apiUrl || '';
    } else if (json) {
      url = json.apiUrl || OPENAI_DEFAULT_BASE_URL;
    } else {
      const configToml = readText(codexConfigPath(name));
      url = (configToml && readTomlString(configToml, 'base_url')) || OPENAI_DEFAULT_BASE_URL;
    }
    return { name, type, url };
  });
}

export function resolveProfile(input) {
  // Exact names win over numeric indices. A well-formed name maps to at most
  // two files, so check those directly instead of scanning every profile.
  if (isSafeProfileName(input)) {
    const { exists, type } = anyProfileExists(input);
    if (exists) return { name: input, type };
  }
  const all = getAllProfiles();
  const byExactName = all.find((p) => p.name === input);
  if (byExactName) return byExactName;
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
