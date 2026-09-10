// Defaults applied by ccc without overriding explicit Claude Code settings.

import fs from 'fs';
import { CLAUDE_SETTINGS_PATH } from './config.js';
import { applyAnyRouterSettings } from './anyrouter.js';
import { getClaudeProfileEnv, isModelOverrideKey } from './env.js';
import { t } from './i18n.js';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function readClaudeSettings() {
  if (!fs.existsSync(CLAUDE_SETTINGS_PATH)) return {};
  try {
    const settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf8'));
    if (isObject(settings)) return settings;
  } catch { /* Report the path without including potentially secret JSON contents. */ }
  throw new Error(t('common.settings_invalid', { path: CLAUDE_SETTINGS_PATH }));
}

function deepMerge(target, source) {
  if (!isObject(source)) return target;
  for (const [key, value] of Object.entries(source)) {
    const previous = Object.prototype.hasOwnProperty.call(target, key) ? target[key] : undefined;
    const merged = isObject(value)
      ? deepMerge(isObject(previous) ? previous : {}, value)
      : structuredClone(value);
    // Define own properties so JSON keys such as __proto__ never mutate prototypes.
    Object.defineProperty(target, key, { value: merged, enumerable: true, writable: true, configurable: true });
  }
  return target;
}

export function mergeClaudeSettings(main, profile, { clearModelOverrides = true } = {}) {
  const settings = deepMerge(deepMerge({}, main), profile.settings);
  const profileEnv = getClaudeProfileEnv(profile);
  settings.env = { ...(isObject(settings.env) ? settings.env : {}), ...profileEnv };

  for (const key of Object.keys(settings.env)) {
    if (isModelOverrideKey(key) && !Object.prototype.hasOwnProperty.call(profileEnv, key)) {
      // An empty value prevents Claude from falling back to another settings source.
      if (clearModelOverrides) settings.env[key] = '';
      else delete settings.env[key];
    }
  }
  if (!profile.settings?.model) delete settings.model;
  settings.hasCompletedOnboarding = true;
  return applyClaudeDefaults(applyAnyRouterSettings(profile.apiUrl, settings));
}

export function applyClaudeDefaults(settings) {
  if (settings.skipWebFetchPreflight === undefined) {
    settings.skipWebFetchPreflight = true;
  }
  return settings;
}
