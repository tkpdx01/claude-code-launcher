import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CACHE_DIR } from './config.js';
import { atomicWriteJson, ensurePrivateDir, readJsonStrict } from './fs-safe.js';
import { input, select } from './prompt.js';
import { t } from './i18n.js';
import { dim, gray, yellow } from './color.js';
import { withSpinner } from './ui.js';

const REQUEST_TIMEOUT_MS = 8000;
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export const OPENAI_MODEL_CATALOG = [
  { id: 'gpt-5.3-codex-spark', name: 'GPT 5.3 Codex Spark', capability: 'agent' },
  { id: 'gpt-5.4', name: 'GPT 5.4', capability: 'agent' },
  { id: 'gpt-5.4-mini', name: 'GPT 5.4 Mini', capability: 'agent' },
  { id: 'gpt-5.5', name: 'GPT 5.5', capability: 'agent' },
  { id: 'gpt-5.6-sol', name: 'GPT 5.6 Sol', capability: 'agent' },
  { id: 'gpt-5.6-terra', name: 'GPT 5.6 Terra', capability: 'agent' },
  { id: 'gpt-5.6-luna', name: 'GPT 5.6 Luna', capability: 'agent' },
  { id: 'codex-auto-review', name: 'Codex Auto Review', capability: 'review' },
  { id: 'gpt-image-1.5', name: 'GPT Image 1.5', capability: 'image' },
  { id: 'gpt-image-2', name: 'GPT Image 2', capability: 'image' },
];

export const CLAUDE_MODEL_CATALOG = [
  { id: 'fable', name: 'Fable', capability: 'agent' },
  { id: 'sonnet', name: 'Sonnet (latest alias)', capability: 'agent' },
  { id: 'sonnet5', name: 'Sonnet 5 / gateway alias', capability: 'agent' },
  { id: 'opus', name: 'Opus (latest alias)', capability: 'agent' },
];

export const DEEPSEEK_MODEL_CATALOG = [
  { id: 'deepseek-chat', name: 'DeepSeek Chat (V3)', capability: 'agent' },
  { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)', capability: 'agent' },
];

function fallbackCatalog(type) {
  if (type === 'codex') return OPENAI_MODEL_CATALOG;
  if (type === 'deepseek') return DEEPSEEK_MODEL_CATALOG;
  return CLAUDE_MODEL_CATALOG;
}

function normalizeBaseUrl(baseUrl) {
  return (baseUrl || '').trim() || 'https://api.openai.com/v1';
}

export function buildModelsEndpoint(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl).replace(/\/+$/, '');
  if (normalized.endsWith('/models')) return normalized;
  try {
    const url = new URL(normalized);
    const current = url.pathname || '/';
    url.pathname = current === '/' ? '/v1/models' : `${current.replace(/\/+$/, '')}/models`;
    return url.toString();
  } catch {
    return `${normalized}/models`;
  }
}

function cachePath(type, baseUrl) {
  const key = crypto.createHash('sha256').update(`${type}:${baseUrl}`).digest('hex').slice(0, 20);
  return path.join(CACHE_DIR, 'models', `${key}.json`);
}

function readCache(type, baseUrl) {
  const file = cachePath(type, baseUrl);
  let cached;
  try {
    cached = readJsonStrict(file, { defaultValue: null });
  } catch {
    return null;
  }
  if (!cached || !Array.isArray(cached.models)) return null;
  return cached;
}

function writeCache(type, baseUrl, models) {
  const file = cachePath(type, baseUrl);
  ensurePrivateDir(path.dirname(file));
  atomicWriteJson(file, {
    type,
    fetchedAt: new Date().toISOString(),
    models,
  });
}

function authHeaders(type, baseUrl, apiKey) {
  if (type === 'claude') {
    let official = false;
    try {
      official = new URL(baseUrl).hostname === 'api.anthropic.com';
    } catch { /* request validation reports malformed URLs */ }
    if (official) {
      return {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        accept: 'application/json',
      };
    }
    return {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json',
    };
  }
  return { authorization: `Bearer ${apiKey}`, accept: 'application/json' };
}

export async function fetchModelIds(type, baseUrl, apiKey) {
  const token = String(apiKey || '').trim();
  if (!token) throw new Error('API key is empty');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(buildModelsEndpoint(baseUrl), {
      headers: authHeaders(type, baseUrl, token),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const rows = Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.models)
        ? data.models
        : [];
    return [...new Set(rows
      .map((model) => typeof model === 'string' ? model : model?.id)
      .filter((id) => typeof id === 'string' && id.trim())
      .map((id) => id.trim()))]
      .sort((a, b) => a.localeCompare(b));
  } finally {
    clearTimeout(timer);
  }
}

function mergeModels(type, remoteIds = []) {
  const models = new Map();
  for (const model of fallbackCatalog(type)) models.set(model.id, { ...model, source: 'catalog' });
  for (const id of remoteIds) {
    const existing = models.get(id);
    models.set(id, existing ? { ...existing, source: 'remote' } : {
      id,
      name: id,
      capability: 'unknown',
      source: 'remote',
    });
  }
  return [...models.values()];
}

export async function discoverModels(options) {
  const type = options.type || 'codex';
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const cached = readCache(type, baseUrl);
  const cachedAge = cached ? Date.now() - Date.parse(cached.fetchedAt) : Infinity;

  if (!options.refresh && cached && cachedAge < CACHE_MAX_AGE_MS) {
    return { models: mergeModels(type, cached.models), source: 'cache', error: null };
  }

  if (!options.apiKey) {
    return { models: mergeModels(type), source: 'catalog', error: null };
  }

  try {
    const remoteIds = await withSpinner(t('models.fetching'), () =>
      fetchModelIds(type, baseUrl, options.apiKey));
    writeCache(type, baseUrl, remoteIds);
    return { models: mergeModels(type, remoteIds), source: 'remote', error: null };
  } catch (err) {
    const message = err?.name === 'AbortError' ? 'timeout' : err?.message || 'unknown error';
    if (cached) {
      return { models: mergeModels(type, cached.models), source: 'stale-cache', error: message };
    }
    return { models: mergeModels(type), source: 'catalog', error: message };
  }
}

function modelLabel(model) {
  const capability = model.capability === 'agent' ? '' : ` ${dim(`[${model.capability}]`)}`;
  const id = model.name === model.id ? '' : ` ${gray(model.id)}`;
  return `${model.name}${id}${capability}`;
}

export async function promptModel(options) {
  const current = String(options.currentModel || '').trim();
  if (!process.stdin.isTTY) return current;
  const discovered = await discoverModels({ ...options, refresh: true });
  if (discovered.error) {
    console.log(yellow(t('models.failed', { reason: discovered.error })));
  }

  const choices = [{ name: t('models.default'), value: '' }];
  for (const capability of ['agent', 'review', 'image', 'unknown']) {
    const group = discovered.models.filter((model) => model.capability === capability);
    if (group.length === 0) continue;
    choices.push({ separator: true, name: capability.toUpperCase() });
    for (const model of group) choices.push({ name: modelLabel(model), value: model.id });
  }
  choices.push({ separator: true, name: 'CUSTOM' });
  choices.push({ name: t('models.manual'), value: '__manual__' });

  if (current && !choices.some((choice) => choice.value === current)) {
    choices.splice(1, 0, { name: `${current} ${dim('[current]')}`, value: current });
  }
  const defaultIndex = Math.max(0, choices.findIndex((choice) => choice.value === current));
  const selected = await select(t('models.select'), choices, defaultIndex);
  if (selected !== '__manual__') return selected;
  return input(t('models.prompt'), current);
}

export function promptCodexModel(baseUrl, apiKey, currentModel = '') {
  return promptModel({ type: 'codex', baseUrl, apiKey, currentModel });
}

export function clearModelCache() {
  fs.rmSync(path.join(CACHE_DIR, 'models'), { recursive: true, force: true });
}
