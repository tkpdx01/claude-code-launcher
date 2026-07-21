export function validateApiUrl(value) {
  const normalized = String(value || '').trim().replace(/\/+$/, '');
  if (!normalized) throw new Error('API URL cannot be empty');
  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(`Invalid API URL: ${normalized}`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('API URL must use http:// or https://');
  }
  return normalized;
}

export function validateModelId(value) {
  const model = String(value || '').trim();
  if (model.includes('\n') || model.includes('\r')) {
    throw new Error('Model ID must be a single line');
  }
  return model;
}

export function normalizeSecret(value) {
  return String(value || '').trim();
}
