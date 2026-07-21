// Claude Code launch logic — secure runtime settings + transparent arguments.

import fs from 'node:fs';
import path from 'node:path';
import { CLAUDE_SETTINGS_PATH, TMP_DIR } from './config.js';
import { applyClaudeDefaults } from './claude-settings.js';
import { buildClaudeEnv, isModelOverrideKey } from './env.js';
import { hasClaudeModelOverride } from './args.js';
import { atomicWriteJson, ensurePrivateDir } from './fs-safe.js';
import * as store from './store.js';
import { t } from './i18n.js';
import { commandPreview, danger, panel, typeBadge } from './ui.js';
import { manageChildLifecycle, spawnCli } from './spawn.js';

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readMainSettings() {
  if (!fs.existsSync(CLAUDE_SETTINGS_PATH)) return {};
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf8'));
  } catch (err) {
    throw new Error(`Cannot launch: ${CLAUDE_SETTINGS_PATH} is invalid JSON (${err.message})`);
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`Cannot launch: ${CLAUDE_SETTINGS_PATH} must contain a JSON object`);
  }
  return parsed;
}

export function deepMerge(target, source) {
  if (!isPlainObject(source)) return target;
  for (const key of Object.keys(source)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) continue;
    const sourceValue = source[key];
    const targetValue = target[key];
    if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
      deepMerge(targetValue, sourceValue);
    } else {
      target[key] = structuredClone(sourceValue);
    }
  }
  return target;
}

export function buildClaudeSettings(profile, mainSettings = {}) {
  const merged = deepMerge(structuredClone(mainSettings), profile.settings || {});
  if (!isPlainObject(merged.env)) merged.env = {};

  delete merged.env.ANTHROPIC_API_KEY;
  delete merged.env.ANTHROPIC_AUTH_TOKEN;
  delete merged.env.ANTHROPIC_BASE_URL;
  for (const key of ['CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY']) {
    delete merged.env[key];
  }
  if (profile.apiKey) merged.env.ANTHROPIC_AUTH_TOKEN = profile.apiKey;
  if (profile.apiUrl) merged.env.ANTHROPIC_BASE_URL = profile.apiUrl;

  const profileEnvKeys = new Set();
  if (isPlainObject(profile.env)) {
    for (const [key, value] of Object.entries(profile.env)) {
      merged.env[key] = value;
      profileEnvKeys.add(key);
    }
  }
  for (const key of Object.keys(merged.env)) {
    if (isModelOverrideKey(key) && !profileEnvKeys.has(key)) merged.env[key] = '';
  }
  if (profile.model) merged.model = profile.model;
  else delete merged.model;

  applyClaudeDefaults(merged, { apiUrl: profile.apiUrl });
  return merged;
}

function createRuntimeSettings(profileName, settings) {
  ensurePrivateDir(TMP_DIR);
  const safeName = profileName.replace(/[^A-Za-z0-9_.-]/g, '_');
  const runtimeDir = fs.mkdtempSync(path.join(TMP_DIR, `${safeName}-`));
  ensurePrivateDir(runtimeDir);
  const settingsPath = path.join(runtimeDir, 'settings.json');
  atomicWriteJson(settingsPath, settings);
  return {
    settingsPath,
    cleanup: () => fs.rmSync(runtimeDir, { recursive: true, force: true }),
  };
}

function normalizeOptions(options) {
  if (typeof options === 'boolean') return { dangerous: options, args: [] };
  return { dangerous: false, args: [], ...(options || {}) };
}

export function buildClaudeArgs(profile, settingsPath, options = {}) {
  const normalized = normalizeOptions(options);
  const passthrough = [...normalized.args];
  const args = ['--settings', settingsPath];
  if (profile.model && !hasClaudeModelOverride(passthrough)) {
    args.push('--model', profile.model);
  }
  if (normalized.dangerous) args.push('--dangerously-skip-permissions');
  args.push(...passthrough);
  return args;
}

export function launchClaude(profileName, options = {}) {
  const normalized = normalizeOptions(options);
  const profile = store.readClaudeProfile(profileName);
  if (!profile) throw new Error(t('common.not_exist', { name: profileName }));
  if (!profile.apiKey) throw new Error(t('common.apikey_required'));

  const settings = buildClaudeSettings(profile, readMainSettings());
  const runtime = createRuntimeSettings(profileName, settings);
  const args = buildClaudeArgs(profile, runtime.settingsPath, normalized);
  const childEnv = buildClaudeEnv(profile);

  if (process.stdout.isTTY) {
    panel('Launch', [
      ['Profile', `${typeBadge(profile.type)}  ${profileName}`],
      ['Model', profile.model || 'upstream default'],
      ['Access', normalized.dangerous ? 'FULL ACCESS' : 'standard'],
    ], normalized.dangerous ? 'danger' : 'cyan');
    if (normalized.dangerous) danger('Permission checks are disabled for this session.');
    commandPreview('claude', args);
  }

  const child = spawnCli('claude', args, { stdio: 'inherit', env: childEnv });
  manageChildLifecycle(child, {
    cleanup: runtime.cleanup,
    onError: (err) => console.error(t('launch.failed', { msg: err.message })),
  });
}
