// AnyRouter rejects Claude requests that omit the 1M-context beta header.
import { isModelOverrideKey } from './model-keys.js';

export const ANYROUTER_DEFAULT_MODEL = 'claude-fable-5-1[1m]';
export const CONTEXT_1M_BETA = 'context-1m-2025-08-07';

const ANYROUTER_URL_RE = /(^|[./])anyrouter\.(top|dev|win|ai)([./:?#]|$)/i;

const FLAG_ENV = Object.freeze({
  CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '0',
  CLAUDE_CODE_DISABLE_1M_CONTEXT: '0',
});

const AUTO_ENV_KEYS = [
  ...Object.keys(FLAG_ENV),
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
  'ANTHROPIC_CUSTOM_HEADERS',
  'ANTHROPIC_DEFAULT_FABLE_MODEL',
];

export function isAnyRouterUrl(url) {
  return ANYROUTER_URL_RE.test(String(url || '').trim());
}

export function with1mModel(model) {
  const value = String(model || '').trim();
  if (!value) return value;
  if (/\[1m\]$/i.test(value)) return value;
  return `${value}[1m]`;
}

export function without1mModel(model) {
  return String(model || '').replace(/\[1m\]$/i, '');
}

export function withContext1mHeader(value) {
  const lines = String(value || '').split(/\r?\n/);
  let found = false;
  const next = lines.map((line) => {
    const idx = line.indexOf(':');
    if (idx < 0) return line;
    const name = line.slice(0, idx).trim();
    const headerValue = line.slice(idx + 1).trim();
    if (name.toLowerCase() !== 'anthropic-beta') return line;
    found = true;
    const parts = headerValue.split(',').map((part) => part.trim()).filter(Boolean);
    if (!parts.includes(CONTEXT_1M_BETA)) parts.push(CONTEXT_1M_BETA);
    return `anthropic-beta: ${parts.join(',')}`;
  });
  if (!found) {
    const cleaned = next.filter((line) => line.trim() !== '');
    cleaned.push(`anthropic-beta: ${CONTEXT_1M_BETA}`);
    return cleaned.join('\n');
  }
  return next.join('\n');
}

export function withoutContext1mHeader(value) {
  const next = String(value || '').split(/\r?\n/).map((line) => {
    const idx = line.indexOf(':');
    if (idx < 0) return line;
    const name = line.slice(0, idx).trim();
    const headerValue = line.slice(idx + 1).trim();
    if (name.toLowerCase() !== 'anthropic-beta') return line;
    const parts = headerValue.split(',').map((part) => part.trim()).filter((part) => part && part !== CONTEXT_1M_BETA);
    return parts.length > 0 ? `anthropic-beta: ${parts.join(',')}` : '';
  }).filter((line) => line.trim() !== '');
  return next.join('\n');
}

export function applyAnyRouterEnv(apiUrl, env = {}) {
  if (!isAnyRouterUrl(apiUrl)) return env;
  const next = { ...env, ...FLAG_ENV };
  // Presence-based in Claude Code: any non-empty value disables the traffic.
  next.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '';
  next.ANTHROPIC_CUSTOM_HEADERS = withContext1mHeader(next.ANTHROPIC_CUSTOM_HEADERS);
  for (const [key, value] of Object.entries(next)) {
    if (isModelOverrideKey(key) && value) next[key] = with1mModel(value);
  }
  if (!next.ANTHROPIC_DEFAULT_FABLE_MODEL) {
    next.ANTHROPIC_DEFAULT_FABLE_MODEL = ANYROUTER_DEFAULT_MODEL;
  }
  return next;
}

export function applyAnyRouterSettings(apiUrl, settings = {}) {
  if (!isAnyRouterUrl(apiUrl)) return settings;
  const next = { ...settings };
  if (next.model) next.model = with1mModel(next.model);
  if (next.modelPrefer1mContext === undefined) next.modelPrefer1mContext = true;
  return next;
}

function pruneEmpty(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== ''));
}

export function stripAnyRouterOverlay(profile) {
  const env = { ...profile.env };
  for (const key of AUTO_ENV_KEYS) {
    if (key === 'ANTHROPIC_CUSTOM_HEADERS') {
      const next = withoutContext1mHeader(env.ANTHROPIC_CUSTOM_HEADERS);
      if (next) env.ANTHROPIC_CUSTOM_HEADERS = next;
      else delete env.ANTHROPIC_CUSTOM_HEADERS;
      continue;
    }
    if (key === 'ANTHROPIC_DEFAULT_FABLE_MODEL') {
      if (!env[key]) continue;
      const stripped = without1mModel(env[key]);
      if (!stripped || stripped === without1mModel(ANYROUTER_DEFAULT_MODEL)) delete env[key];
      else env[key] = stripped;
      continue;
    }
    delete env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    if (isModelOverrideKey(key) && value) {
      const stripped = without1mModel(value);
      if (stripped) env[key] = stripped;
      else delete env[key];
    }
  }
  const settings = { ...profile.settings };
  if (settings.model) {
    const stripped = without1mModel(settings.model);
    if (stripped) settings.model = stripped;
    else delete settings.model;
  }
  if (settings.modelPrefer1mContext === true) delete settings.modelPrefer1mContext;
  const next = { ...profile, env: pruneEmpty(env), settings: pruneEmpty(settings) };
  if (Object.keys(next.env).length === 0) delete next.env;
  if (Object.keys(next.settings).length === 0) delete next.settings;
  return next;
}

export function applyAnyRouterProfile(profile, { setDefaultModel = false } = {}) {
  if (!profile) return profile;
  if (!isAnyRouterUrl(profile.apiUrl)) return stripAnyRouterOverlay(profile);
  const env = applyAnyRouterEnv(profile.apiUrl, { ...profile.env });
  delete env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC;
  const settings = applyAnyRouterSettings(profile.apiUrl, { ...profile.settings });
  const currentModel = settings.model || profile.model;
  if (currentModel) {
    settings.model = with1mModel(currentModel);
  } else if (setDefaultModel) {
    settings.model = ANYROUTER_DEFAULT_MODEL;
  }
  return { ...profile, env, settings };
}
