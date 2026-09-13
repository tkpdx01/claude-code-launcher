import { t } from './i18n.js';

const RESERVED = new Set([
  'list', 'ls', 'use', 'show', 'new', 'edit', 'delete', 'rm', 'apply', 'help',
]);

export function normalizeProfileName(name) {
  return typeof name === 'string' ? name.trim() : '';
}

// A name that stays inside the profile directories when joined to a path and
// always produces a distinct file or directory name (never "." or blanks).
export function isSafeProfileName(name) {
  return typeof name === 'string'
    && /^[a-zA-Z0-9_\-. ]{1,64}$/.test(name)
    && /[a-zA-Z0-9_-]/.test(name)
    && !name.includes('..');
}

export function validateProfileName(name) {
  const normalized = normalizeProfileName(name);
  if (!normalized) return t('new.name_empty');
  if (RESERVED.has(normalized)) return t('new.name_reserved');
  if (normalized.length > 64) return t('new.name_long');
  if (!isSafeProfileName(normalized)) return t('new.name_invalid');
  return true;
}
