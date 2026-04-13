import { t } from './i18n.js';

const RESERVED = new Set([
  'list', 'ls', 'use', 'show', 'new', 'edit', 'delete', 'rm', 'apply', 'help',
]);

export function normalizeProfileName(name) {
  return typeof name === 'string' ? name.trim() : '';
}

export function validateProfileName(name) {
  const normalized = normalizeProfileName(name);
  if (!normalized) return t('new.name_empty');
  if (RESERVED.has(normalized)) return t('new.name_reserved');
  if (normalized.includes('..') || normalized.includes('/') || normalized.includes('\\')) {
    return t('new.name_invalid');
  }
  if (!/^[a-zA-Z0-9_\-. ]+$/.test(normalized)) return t('new.name_invalid');
  if (normalized.length > 64) return t('new.name_long');
  return true;
}
