// Profile CRUD — new slim format + old format auto-migration

import fs from 'fs';
import path from 'path';
import {
  tomlString,
  fixCodexAnalyticsScope,
  fixReservedProviderName,
} from './codex-config.js';
import { OPENAI_DEFAULT_BASE_URL } from './providers.js';
import { isSafeProfileName } from './profile-name.js';
import { atomicWrite, atomicWriteBatch, privateDir, exists } from './files.js';
import { setTomlValue, tomlText, scanToml } from './toml.js';
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
    privateDir(dir);
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
  atomicWrite(claudePath(name), JSON.stringify(data, null, 2) + '\n');
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
  privateDir(codexDir(name));
  atomicWriteBatch([
    { file: codexConfigPath(name), data: sanitizeCodexConfigToml(configToml) },
    { file: codexAuthPath(name), data: JSON.stringify(auth, null, 2) + '\n' },
  ]);
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
      const config = fixCodexAnalyticsScope(profile.configToml);
      baseUrl = getCodexBaseUrl(config);
      model = tomlText(config, ['model']);
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

const updateRootKey = (text, key, value) => setTomlValue(text, [key], value);

function updateCodexProviderConfig(configToml, baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl) || OPENAI_DEFAULT_BASE_URL;
  if (!isCustomOpenAIBaseUrl(normalized)) return configToml;
  for (const [key, value] of Object.entries({
    name: '"OpenAI Compatible"', base_url: tomlString(normalized),
    env_key: '"OPENAI_API_KEY"', wire_api: '"responses"', requires_openai_auth: null,
  })) configToml = setTomlValue(configToml, ['model_providers', CCC_OPENAI_COMPAT_PROVIDER, key], value);
  return configToml;
}

export function getCodexBaseUrl(config) {
  const provider = tomlText(config, ['model_provider']) || 'openai';
  return tomlText(config, ['model_providers', provider, 'base_url'])
    || (provider === 'openai' ? OPENAI_DEFAULT_BASE_URL : '');
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
  const { lines, eol, entries, sections } = scanToml(configToml);
  const remove = new Set();
  for (const entry of entries.filter((e) => /^sandbox(?:_mode|_permissions)?$/.test(e.path.at(-1)))) {
    for (let i = entry.start; i < entry.end; i++) remove.add(i);
  }
  for (const section of sections.filter((s) => s.path.length === 1 && s.path[0] === 'windows')) {
    const content = lines.slice(section.start + 1, section.end)
      .some((line, i) => !remove.has(section.start + 1 + i) && line.trim() && !line.trim().startsWith('#'));
    if (!content) for (let i = section.start; i < section.end; i++) remove.add(i);
  }
  return lines.filter((_, i) => !remove.has(i)).join(eol);
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
  if (changed) atomicWrite(configPath, repaired);
  return { changed, renamedProvider: repaired !== upstream };
}

function ensureGpt55CatalogFile(name) {
  const target = path.join(codexDir(name), GPT_55_CATALOG_FILE);
  if (fs.existsSync(target)) return true;

  const source = path.join(CODEX_HOME_PATH, GPT_55_CATALOG_FILE);
  if (!fs.existsSync(source)) return false;

  atomicWrite(target, fs.readFileSync(source));
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
      atomicWrite(path.join(targetDir, entry.name), fs.readFileSync(path.join(dir, entry.name)));
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
      url = configToml ? getCodexBaseUrl(fixCodexAnalyticsScope(configToml)) : OPENAI_DEFAULT_BASE_URL;
    }
    return { name, type, url };
  });
}

export function resolveProfile(input) {
  // Exact names win over numeric indices. A well-formed name maps to at most
  // two files, so check those directly instead of scanning every profile.
  if (isSafeProfileName(input)) {
    const { exists, type } = anyProfileExists(input);
    if (exists) return { name: type === 'codex' ? canonicalCodexName(input) : input, type };
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

// Old directory names remain as links so absolute session/database paths stay valid.
export function canonicalCodexName(name) {
  const dir = codexDir(name);
  if (!exists(dir) || !fs.lstatSync(dir).isSymbolicLink()) return name;
  const actual = fs.realpathSync(dir);
  if (path.dirname(actual) !== fs.realpathSync(CODEX_PROFILES_DIR)) {
    throw new Error('Codex profile link points outside the profile directory');
  }
  return path.basename(actual);
}

export function renameCodexProfile(name, newName) {
  if (!isSafeProfileName(newName) || exists(codexDir(newName)) || exists(claudePath(newName))) {
    throw new Error('Profile name is invalid or already exists');
  }
  materializeJsonCodexProfile(name);
  name = canonicalCodexName(name);
  const source = codexDir(name);
  const target = codexDir(newName);
  fs.renameSync(source, target);
  try {
    fs.symlinkSync(process.platform === 'win32' ? target : newName, source,
      process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    fs.renameSync(target, source);
    throw error;
  }
  if (getDefaultProfileName() === name) setDefaultProfile(newName);
}

export function getDefaultProfileName() {
  const name = readText(path.join(CONFIG_DIR, 'default'))?.trim();
  return isSafeProfileName(name) ? name : '';
}

export function setDefaultProfile(name) {
  if (name && !isSafeProfileName(name)) throw new Error('Invalid default profile name');
  ensureDirs();
  atomicWrite(path.join(CONFIG_DIR, 'default'), name ? name + '\n' : '');
}

export function profilePaths(profiles) {
  const targets = new Set();
  for (const { name, type } of profiles) {
    if (!isSafeProfileName(name)) throw new Error('Invalid profile name');
    if (type === 'codex') {
      if (exists(codexDir(name))) targets.add(codexDir(name));
      if (readJsonCodexProfile(name)) targets.add(claudePath(name));
    } else targets.add(claudePath(name));
  }
  // Include rename links, without following them when moving/deleting.
  const actualTargets = new Set([...targets].map((file) => fs.realpathSync(file)));
  for (const entry of fs.readdirSync(CODEX_PROFILES_DIR, { withFileTypes: true })) {
    if (!entry.isSymbolicLink()) continue;
    const link = codexDir(entry.name);
    try { if (actualTargets.has(fs.realpathSync(link))) targets.add(link); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return [...targets];
}
