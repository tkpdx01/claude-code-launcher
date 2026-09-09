// Native ~/.codex config helpers. CCC launch must not leave ChatGPT login
// unusable by persisting model_provider = "ccc_openai" + env_key.

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { CODEX_HOME_PATH } from './config.js';
import { atomicWriteFile } from './fs-safe.js';
import { CCC_OPENAI_API_KEY_ENV, CCC_OPENAI_COMPAT_PROVIDER } from './store.js';

const CCC_MANAGED_COMMENT = '# Codex profile managed by ccc';

export function getNativeCodexAuthPath() {
  return path.join(CODEX_HOME_PATH, 'auth.json');
}

export function getNativeCodexConfigPath() {
  return path.join(CODEX_HOME_PATH, 'config.toml');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitLines(text) {
  return String(text).split('\n');
}

function joinLines(lines) {
  return lines.join('\n');
}

function tomlHeaderName(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('[')) return null;
  const close = trimmed.indexOf(']');
  if (close < 1) return null;
  return trimmed.slice(1, close).trim();
}

function isTableHeader(line) {
  return tomlHeaderName(line) !== null;
}

function isNamedTableOrChild(line, name) {
  const header = tomlHeaderName(line);
  return header === name || Boolean(header && header.startsWith(`${name}.`));
}

function stableJson(value) {
  return JSON.stringify(value ?? null);
}

export function removeRootTomlKey(text, key) {
  const assign = new RegExp(`^${escapeRegExp(key)}\\s*=`);
  const out = [];
  let seenTable = false;
  for (const line of splitLines(text)) {
    if (isTableHeader(line)) seenTable = true;
    if (!seenTable && assign.test(line)) continue;
    out.push(line);
  }
  return joinLines(out);
}

export function setRootTomlKey(text, key, tomlLiteralValue) {
  const assign = new RegExp(`^${escapeRegExp(key)}\\s*=`);
  const replacement = `${key} = ${tomlLiteralValue}`;
  const lines = splitLines(text);
  const out = [];
  let seenTable = false;
  let replaced = false;
  for (const line of lines) {
    if (isTableHeader(line)) {
      if (!seenTable && !replaced) {
        out.push(replacement);
        replaced = true;
      }
      seenTable = true;
    }
    if (!seenTable && assign.test(line)) {
      out.push(replacement);
      replaced = true;
      continue;
    }
    out.push(line);
  }
  if (!replaced) out.unshift(replacement);
  return joinLines(out);
}

export function removeTomlTable(text, name) {
  const out = [];
  let skipping = false;
  for (const line of splitLines(text)) {
    if (isNamedTableOrChild(line, name)) {
      skipping = true;
      continue;
    }
    if (skipping && isTableHeader(line)) skipping = false;
    if (!skipping) out.push(line);
  }
  return joinLines(out).replace(/\n{3,}/g, '\n\n');
}

function replaceCccProviderTable(text, provider) {
  const name = `model_providers.${CCC_OPENAI_COMPAT_PROVIDER}`;
  const rendered = `${stringifyToml({
    model_providers: { [CCC_OPENAI_COMPAT_PROVIDER]: provider },
  }).trimEnd()}\n`;
  const lines = splitLines(text);
  const out = [];
  let skipping = false;
  let inserted = false;
  for (const line of lines) {
    if (isNamedTableOrChild(line, name)) {
      if (!skipping && !inserted) {
        out.push(...splitLines(rendered.trimEnd()));
        inserted = true;
      }
      skipping = true;
      continue;
    }
    if (skipping && isTableHeader(line)) skipping = false;
    if (!skipping) out.push(line);
  }
  if (!inserted) return `${joinLines(out).trimEnd()}\n\n${rendered}`;
  return joinLines(out).replace(/\n{3,}/g, '\n\n');
}

function removeManagedComment(text) {
  const out = splitLines(text).filter((line) => line.trim() !== CCC_MANAGED_COMMENT);
  return joinLines(out);
}

function collapseLeadingNewlines(text) {
  return text.replace(/^\n+/, '');
}

export function parseCodexToml(text) {
  if (!String(text || '').trim()) return {};
  return parseToml(text);
}

export function snapshotCodexProvider(text) {
  try {
    const parsed = parseCodexToml(text);
    const provider = parsed.model_providers?.[CCC_OPENAI_COMPAT_PROVIDER];
    return {
      modelProvider: parsed.model_provider,
      hasCccProvider: Boolean(provider),
      cccProvider: provider && typeof provider === 'object' ? { ...provider } : undefined,
    };
  } catch {
    return { modelProvider: undefined, hasCccProvider: false, unreadable: true };
  }
}

export function stripCccCodexProvider(text) {
  const parsed = parseCodexToml(text);
  const hadProvider = parsed.model_provider === CCC_OPENAI_COMPAT_PROVIDER;
  const hadTable = Boolean(parsed.model_providers?.[CCC_OPENAI_COMPAT_PROVIDER]);
  if (!hadProvider && !hadTable) return { next: text, changed: false };

  let next = text;
  if (hadProvider) next = removeRootTomlKey(next, 'model_provider');
  if (hadTable) next = removeTomlTable(next, `model_providers.${CCC_OPENAI_COMPAT_PROVIDER}`);
  next = collapseLeadingNewlines(removeManagedComment(next));
  return { next, changed: true };
}

export function revertLeakedCccCodexProvider(text, snapshot = {}) {
  if (snapshot.unreadable) return { next: text, changed: false };
  let parsed;
  try {
    parsed = parseCodexToml(text);
  } catch {
    return { next: text, changed: false };
  }

  let next = text;
  if (
    parsed.model_provider === CCC_OPENAI_COMPAT_PROVIDER
    && snapshot.modelProvider !== CCC_OPENAI_COMPAT_PROVIDER
  ) {
    if (snapshot.modelProvider) {
      next = setRootTomlKey(next, 'model_provider', JSON.stringify(snapshot.modelProvider));
    } else {
      next = removeRootTomlKey(next, 'model_provider');
    }
  }

  const currentProvider = parsed.model_providers?.[CCC_OPENAI_COMPAT_PROVIDER];
  if (currentProvider && !snapshot.hasCccProvider) {
    next = removeTomlTable(next, `model_providers.${CCC_OPENAI_COMPAT_PROVIDER}`);
  } else if (
    currentProvider
    && snapshot.hasCccProvider
    && snapshot.cccProvider
    && stableJson(currentProvider) !== stableJson(snapshot.cccProvider)
  ) {
    next = replaceCccProviderTable(next, snapshot.cccProvider);
  }
  return { next, changed: next !== text };
}

export function readNativeCodexConfigText() {
  const configPath = getNativeCodexConfigPath();
  if (!fs.existsSync(configPath)) return { configPath, existed: false, text: '' };
  return { configPath, existed: true, text: fs.readFileSync(configPath, 'utf8') };
}

export function snapshotNativeCodexProvider() {
  const { configPath, existed, text } = readNativeCodexConfigText();
  return { configPath, existed, ...snapshotCodexProvider(existed ? text : '') };
}

export function restoreLeakedNativeCodexProvider(snapshot) {
  if (!snapshot || snapshot.unreadable) return false;
  const { configPath, existed, text } = readNativeCodexConfigText();
  if (!existed) return false;
  const { next, changed } = revertLeakedCccCodexProvider(text, snapshot);
  if (!changed) return false;
  atomicWriteFile(configPath, next);
  return true;
}

function authHasChatgptTokens(auth) {
  return Boolean(auth?.tokens && typeof auth.tokens === 'object'
    && (auth.tokens.access_token || auth.tokens.id_token || auth.tokens.refresh_token));
}

function authHasApiKey(auth) {
  return typeof auth?.OPENAI_API_KEY === 'string' && Boolean(auth.OPENAI_API_KEY.trim());
}

export function inspectNativeCodexProviderAuth() {
  const configPath = getNativeCodexConfigPath();
  const authPath = getNativeCodexAuthPath();
  const result = {
    configPath,
    authPath,
    providerId: 'openai',
    isCccProvider: false,
    envKey: '',
    envPresent: false,
    requiresOpenAiAuth: true,
    authMode: '',
    hasChatgptTokens: false,
    hasAuthApiKey: false,
    status: 'ok',
    detail: 'default openai provider',
  };

  if (fs.existsSync(configPath)) {
    let config;
    try {
      config = parseCodexToml(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
      result.status = 'fail';
      result.detail = `invalid TOML: ${err.message}`;
      return result;
    }
    const providerId = config.model_provider || 'openai';
    const provider = config.model_providers?.[providerId] || {};
    result.providerId = providerId;
    result.isCccProvider = providerId === CCC_OPENAI_COMPAT_PROVIDER;
    result.envKey = typeof provider.env_key === 'string' ? provider.env_key : '';
    result.requiresOpenAiAuth = provider.requires_openai_auth === true
      || (!result.isCccProvider && provider.requires_openai_auth !== false && !result.envKey);
    result.envPresent = Boolean(result.envKey && String(process.env[result.envKey] || '').trim());
  }

  if (fs.existsSync(authPath)) {
    try {
      const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
      result.authMode = auth?.auth_mode || '';
      result.hasChatgptTokens = authHasChatgptTokens(auth);
      result.hasAuthApiKey = authHasApiKey(auth);
    } catch (err) {
      result.status = 'fail';
      result.detail = `invalid auth.json: ${err.message}`;
      return result;
    }
  }

  if (result.isCccProvider && result.hasChatgptTokens && result.authMode === 'chatgpt') {
    if (result.envKey && !result.requiresOpenAiAuth && !result.envPresent) {
      result.status = 'fail';
      result.detail = `ccc_openai requires ${result.envKey}, so native codex ignores ChatGPT login. Run: ccc apply --restore-native`;
      return result;
    }
    result.status = 'warn';
    result.detail = result.envKey
      ? `ccc_openai is the native default; ChatGPT login is ignored in favor of ${result.envKey}. Run: ccc apply --restore-native`
      : 'ccc_openai is the native default; ChatGPT tokens will be sent to the CCC gateway. Run: ccc apply --restore-native';
    return result;
  }

  if (result.isCccProvider && result.envKey && !result.requiresOpenAiAuth && !result.envPresent) {
    result.status = 'fail';
    result.detail = `ccc_openai requires ${result.envKey} which is not set. Export it or run: ccc apply --restore-native`;
    return result;
  }

  if (result.isCccProvider && result.requiresOpenAiAuth && !result.hasAuthApiKey && result.authMode !== 'chatgpt') {
    result.status = 'fail';
    result.detail = 'ccc_openai expects an API key in auth.json. Re-apply a Codex profile or run: ccc apply --restore-native';
    return result;
  }

  if (result.isCccProvider) {
    result.detail = result.envKey
      ? `ccc_openai via ${result.envKey}${result.envPresent ? '' : ' (missing)'}`
      : 'ccc_openai via OpenAI auth';
  } else if (result.hasChatgptTokens && result.authMode === 'chatgpt') {
    result.detail = 'openai provider · ChatGPT login';
  }

  return result;
}

export function buildLaunchCodexProvider(profile) {
  return {
    name: 'CCC OpenAI Compatible',
    base_url: profile.apiUrl,
    env_key: CCC_OPENAI_API_KEY_ENV,
    wire_api: profile.wireApi || 'responses',
    requires_openai_auth: false,
  };
}

export function buildApplyCodexProvider(profile) {
  return {
    name: 'CCC OpenAI Compatible',
    base_url: profile.apiUrl,
    wire_api: profile.wireApi || 'responses',
    requires_openai_auth: true,
  };
}
