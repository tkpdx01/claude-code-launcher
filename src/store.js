// Versioned profile storage with legacy Claude/Codex compatibility.

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import {
  CONFIG_DIR,
  PROFILES_DIR,
  CODEX_PROFILES_DIR,
  TMP_DIR,
  CACHE_DIR,
  BACKUPS_DIR,
} from './config.js';
import {
  atomicWriteJson,
  enforcePrivateFile,
  ensurePrivateDir,
  removeEmptyParents,
} from './fs-safe.js';

export const PROFILE_SCHEMA_VERSION = 2;
export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';
export const CCC_OPENAI_COMPAT_PROVIDER = 'ccc_openai';

function chmodDirSafe(dir) {
  try {
    fs.chmodSync(dir, 0o700);
  } catch (err) {
    if (process.platform !== 'win32') throw err;
  }
}

function cleanupStaleRuntimeSettings() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const entry of fs.readdirSync(TMP_DIR, { withFileTypes: true })) {
    const target = path.join(TMP_DIR, entry.name);
    let stat;
    try {
      stat = fs.statSync(target);
    } catch {
      continue;
    }
    if (stat.mtimeMs >= cutoff) {
      if (entry.isFile()) enforcePrivateFile(target);
      continue;
    }
    fs.rmSync(target, { recursive: true, force: true });
  }
}

export function ensureDirs() {
  for (const dir of [
    CONFIG_DIR,
    PROFILES_DIR,
    CODEX_PROFILES_DIR,
    TMP_DIR,
    CACHE_DIR,
    BACKUPS_DIR,
  ]) {
    ensurePrivateDir(dir);
  }

  for (const file of fs.readdirSync(PROFILES_DIR)) {
    if (file.endsWith('.json')) enforcePrivateFile(path.join(PROFILES_DIR, file));
  }

  for (const entry of fs.readdirSync(CODEX_PROFILES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(CODEX_PROFILES_DIR, entry.name);
    chmodDirSafe(dir);
    enforcePrivateFile(path.join(dir, 'auth.json'));
    enforcePrivateFile(path.join(dir, 'config.toml'));
  }
  cleanupStaleRuntimeSettings();
}

function profilePath(name) {
  return path.join(PROFILES_DIR, `${name}.json`);
}

function legacyCodexDir(name) {
  return path.join(CODEX_PROFILES_DIR, name);
}

function readRawProfile(name) {
  const file = profilePath(name);
  if (!fs.existsSync(file)) return null;
  try {
    enforcePrivateFile(file);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function parseClaudeProfile(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  if (raw.type === 'claude' || raw.type === 'deepseek') {
    return {
      schemaVersion: raw.schemaVersion || PROFILE_SCHEMA_VERSION,
      ...raw,
      type: raw.type,
      model: raw.model || raw.settings?.model || '',
    };
  }

  if (raw.env?.ANTHROPIC_AUTH_TOKEN || raw.env?.ANTHROPIC_API_KEY) {
    const { env = {}, ...restSettings } = raw;
    const {
      ANTHROPIC_AUTH_TOKEN,
      ANTHROPIC_API_KEY,
      ANTHROPIC_BASE_URL,
      ...restEnv
    } = env;
    const result = {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      type: 'claude',
      apiUrl: ANTHROPIC_BASE_URL || '',
      apiKey: ANTHROPIC_AUTH_TOKEN || ANTHROPIC_API_KEY || '',
      model: restSettings.model || '',
    };
    const filteredEnv = Object.fromEntries(
      Object.entries(restEnv).filter(([key]) =>
        !key.startsWith('CLAUDE_CODE_') && !key.startsWith('DISABLE_')),
    );
    if (Object.keys(filteredEnv).length > 0) result.env = filteredEnv;
    if (Object.keys(restSettings).length > 0) result.settings = restSettings;
    return result;
  }

  if (raw.apiKey !== undefined && raw.type !== 'codex') {
    return {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      type: 'claude',
      ...raw,
      model: raw.model || raw.settings?.model || '',
    };
  }
  return null;
}

function getUnifiedNames() {
  ensureDirs();
  return fs.readdirSync(PROFILES_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.slice(0, -5));
}

export function readClaudeProfile(name) {
  return parseClaudeProfile(readRawProfile(name));
}

export function claudeProfileExists(name) {
  return Boolean(readClaudeProfile(name));
}

export function isOldFormatProfile(name) {
  const raw = readRawProfile(name);
  return Boolean(raw?.env && !raw?.type);
}

export function saveClaudeProfile(name, profile) {
  ensureDirs();
  const type = profile.type === 'deepseek' ? 'deepseek' : 'claude';
  const data = {
    ...profile,
    schemaVersion: PROFILE_SCHEMA_VERSION,
    type,
  };
  atomicWriteJson(profilePath(name), data);
}

export function deleteClaudeProfile(name) {
  const raw = readRawProfile(name);
  if (raw?.type === 'codex') return;
  const file = profilePath(name);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export function getClaudeCredentials(name) {
  const profile = readClaudeProfile(name);
  return {
    apiKey: profile?.apiKey || '',
    apiUrl: profile?.apiUrl || '',
  };
}

export function normalizeBaseUrl(baseUrl) {
  return (baseUrl || '').trim().replace(/\/+$/, '');
}

function parseCodexConfig(configToml) {
  if (!configToml?.trim()) return {};
  return parseToml(configToml);
}

function findProvider(config, providerId) {
  const providers = config.model_providers || {};
  if (providerId && providers[providerId]) return providers[providerId];
  const first = Object.values(providers)[0];
  return first && typeof first === 'object' ? first : {};
}

function codexDataFromLegacy(auth, configToml) {
  const config = parseCodexConfig(configToml);
  // v2.1.7 accidentally placed root keys under [analytics]. Read them so the
  // affected profiles migrate without losing their model/provider selection.
  const model = config.model || config.analytics?.model || '';
  const providerId = config.model_provider || config.analytics?.model_provider || '';
  const provider = findProvider(config, providerId);
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    type: 'codex',
    provider: 'openai',
    apiKey: auth?.OPENAI_API_KEY || '',
    apiUrl: normalizeBaseUrl(provider.base_url) || OPENAI_DEFAULT_BASE_URL,
    model,
    wireApi: provider.wire_api || 'responses',
  };
}

function readUnifiedCodexProfile(name) {
  const raw = readRawProfile(name);
  if (raw?.type !== 'codex') return null;
  return {
    schemaVersion: raw.schemaVersion || PROFILE_SCHEMA_VERSION,
    provider: 'openai',
    wireApi: 'responses',
    ...raw,
    type: 'codex',
    apiUrl: normalizeBaseUrl(raw.apiUrl) || OPENAI_DEFAULT_BASE_URL,
    model: raw.model || '',
  };
}

function readLegacyCodexProfile(name) {
  const dir = legacyCodexDir(name);
  const authPath = path.join(dir, 'auth.json');
  const configPath = path.join(dir, 'config.toml');
  if (!fs.existsSync(authPath)) return null;
  try {
    enforcePrivateFile(authPath);
    enforcePrivateFile(configPath);
    const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    const configToml = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
    return codexDataFromLegacy(auth, configToml);
  } catch {
    return null;
  }
}

export function readCodexProfileData(name) {
  return readUnifiedCodexProfile(name) || readLegacyCodexProfile(name);
}

export function codexProfileExists(name) {
  return Boolean(readCodexProfileData(name));
}

export function buildCodexConfigObject(baseUrl, model, providerId = CCC_OPENAI_COMPAT_PROVIDER) {
  const normalized = normalizeBaseUrl(baseUrl) || OPENAI_DEFAULT_BASE_URL;
  const config = {
    model_provider: providerId,
    model_providers: {
      [providerId]: {
        name: 'CCC OpenAI Compatible',
        base_url: normalized,
        env_key: 'OPENAI_API_KEY',
        wire_api: 'responses',
      },
    },
  };
  if (model) config.model = model;
  return config;
}

export function generateCodexConfigToml(baseUrl, model) {
  const body = stringifyToml(buildCodexConfigObject(baseUrl, model));
  return `# Codex profile managed by ccc\n${body.trimEnd()}\n`;
}

export function readCodexProfile(name) {
  const profile = readCodexProfileData(name);
  if (!profile) return null;
  return {
    auth: { auth_mode: 'apikey', OPENAI_API_KEY: profile.apiKey || '' },
    configToml: generateCodexConfigToml(profile.apiUrl, profile.model),
    profile,
    source: readUnifiedCodexProfile(name) ? 'unified' : 'legacy',
  };
}

export function saveCodexProfileData(name, profile) {
  ensureDirs();
  atomicWriteJson(profilePath(name), {
    provider: 'openai',
    wireApi: 'responses',
    ...profile,
    schemaVersion: PROFILE_SCHEMA_VERSION,
    type: 'codex',
    apiUrl: normalizeBaseUrl(profile.apiUrl) || OPENAI_DEFAULT_BASE_URL,
    model: profile.model || '',
  });
  // A successful v2 write supersedes the legacy auth/config files. Preserve
  // sessions and databases in the directory, but remove duplicated secrets.
  const legacyDir = legacyCodexDir(name);
  fs.rmSync(path.join(legacyDir, 'auth.json'), { force: true });
  fs.rmSync(path.join(legacyDir, 'config.toml'), { force: true });
  if (fs.existsSync(legacyDir)) removeEmptyParents(legacyDir, CODEX_PROFILES_DIR);
}

export function saveCodexProfile(name, auth, configToml) {
  saveCodexProfileData(name, codexDataFromLegacy(auth || {}, configToml || ''));
}

export function createCodexProfile(name, apiKey, baseUrl, model) {
  saveCodexProfileData(name, { apiKey, apiUrl: baseUrl, model });
}

export function deleteCodexProfile(name) {
  const raw = readRawProfile(name);
  if (raw?.type === 'codex') fs.unlinkSync(profilePath(name));

  const dir = legacyCodexDir(name);
  for (const file of ['auth.json', 'config.toml']) {
    fs.rmSync(path.join(dir, file), { force: true });
  }
  if (fs.existsSync(dir)) removeEmptyParents(dir, CODEX_PROFILES_DIR);
}

export function getCodexCredentials(name) {
  const profile = readCodexProfileData(name);
  return {
    apiKey: profile?.apiKey || '',
    baseUrl: profile?.apiUrl || OPENAI_DEFAULT_BASE_URL,
    model: profile?.model || '',
  };
}

function getLegacyCodexNames() {
  ensureDirs();
  return fs.readdirSync(CODEX_PROFILES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => fs.existsSync(path.join(CODEX_PROFILES_DIR, entry.name, 'auth.json')))
    .map((entry) => entry.name);
}

export function getAllProfiles() {
  const profiles = new Map();
  for (const name of getUnifiedNames()) {
    const raw = readRawProfile(name);
    if (raw?.type === 'codex') {
      profiles.set(name, { name, type: 'codex' });
      continue;
    }
    const profile = parseClaudeProfile(raw);
    if (profile) profiles.set(name, { name, type: profile.type });
  }
  for (const name of getLegacyCodexNames()) {
    if (!profiles.has(name)) profiles.set(name, { name, type: 'codex' });
  }
  return [...profiles.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'zh-CN', { sensitivity: 'base' }));
}

export function resolveProfile(input) {
  const all = getAllProfiles();
  const byName = all.find((profile) => profile.name === input);
  if (byName) return byName;
  if (!/^\d+$/.test(String(input || ''))) return null;
  const index = Number(input) - 1;
  return index >= 0 && index < all.length ? all[index] : null;
}

export function anyProfileExists(name) {
  const profile = getAllProfiles().find((item) => item.name === name);
  return profile
    ? { exists: true, type: profile.type }
    : { exists: false, type: null };
}

export function getCodexProfileDir(name) {
  return fs.existsSync(legacyCodexDir(name)) ? legacyCodexDir(name) : PROFILES_DIR;
}

export function getProfilePath(name) {
  return profilePath(name);
}
