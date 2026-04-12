// Codex model list fetcher — zero dependencies

import { input, select } from './prompt.js';
import { gray, yellow } from './color.js';

const REQUEST_TIMEOUT_MS = 8000;

function normalizeBaseUrl(baseUrl) {
  return (baseUrl || '').trim() || 'https://api.openai.com/v1';
}

function buildModelsEndpoint(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl).replace(/\/+$/, '');
  if (normalized.endsWith('/models')) return normalized;
  try {
    const url = new URL(normalized);
    const p = url.pathname || '/';
    url.pathname = p === '/' || p === '' ? '/v1/models' : `${p.replace(/\/+$/, '')}/models`;
    return url.toString();
  } catch {
    return `${normalized}/models`;
  }
}

async function fetchModelIds(baseUrl, apiKey) {
  const token = (apiKey || '').trim();
  if (!token) throw new Error('API Key is empty');

  const endpoint = buildModelsEndpoint(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ''}`);
    }
    const data = await res.json();
    const models = Array.isArray(data?.data) ? data.data : [];
    return models
      .map((m) => (typeof m?.id === 'string' ? m.id.trim() : ''))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  } finally {
    clearTimeout(timer);
  }
}

export async function promptCodexModel(baseUrl, apiKey, currentModel = '') {
  const current = (currentModel || '').trim();

  if (!(apiKey || '').trim()) {
    return input('Model (leave empty for default):', current);
  }

  console.log(gray('Fetching model list...'));

  try {
    const modelIds = await fetchModelIds(baseUrl, apiKey);
    if (modelIds.length === 0) throw new Error('Empty model list');

    const choices = [
      { name: '(default model)', value: '' },
      ...modelIds.map((id) => ({ name: id, value: id })),
      { name: 'Enter model ID manually', value: '__manual__' },
    ];

    let defaultIndex = 0;
    if (current) {
      const idx = choices.findIndex((c) => c.value === current);
      if (idx >= 0) defaultIndex = idx;
    }

    const value = await select('Select model:', choices, defaultIndex);
    if (value !== '__manual__') return value;
  } catch (err) {
    const reason = err?.name === 'AbortError' ? 'timeout' : (err?.message || 'unknown');
    console.log(yellow(`Failed to fetch models, manual input (${reason})`));
  }

  return input('Model (leave empty for default):', current);
}
