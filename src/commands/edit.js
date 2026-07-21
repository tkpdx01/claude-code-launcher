import * as store from '../store.js';
import { t } from '../i18n.js';
import { input, password, select } from '../prompt.js';
import { promptModel } from '../models.js';
import { normalizeProfileName, validateProfileName } from '../profile-name.js';
import { maskSecret, panel, redactUrl, success, typeBadge } from '../ui.js';
import { normalizeSecret, validateApiUrl, validateModelId } from '../validation.js';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/anthropic';

async function chooseProfile(args) {
  const all = store.getAllProfiles();
  if (all.length === 0) throw new Error(t('common.no_profiles'));
  if (args[0]) {
    const profile = store.resolveProfile(args[0]);
    if (!profile) throw new Error(t('common.not_exist', { name: args[0] }));
    return profile;
  }
  return select(t('pick.edit'), all.map((profile) => ({
    name: `${typeBadge(profile.type)}  ${profile.name}`,
    value: profile,
  })));
}

function validateRename(currentName, newName) {
  if (!newName || newName === currentName) return;
  const validation = validateProfileName(newName);
  if (validation !== true) throw new Error(validation);
  if (store.anyProfileExists(newName).exists) throw new Error(t('edit.exists', { name: newName }));
}

export async function editCommand(args) {
  const info = await chooseProfile(args);

  if (info.type === 'codex') {
    const current = store.readCodexProfileData(info.name);
    panel('Edit profile', [
      ['Type', typeBadge('codex')],
      ['Name', info.name],
      ['API key', maskSecret(current.apiKey)],
      ['Model', current.model || 'upstream default'],
      ['Endpoint', redactUrl(current.apiUrl)],
    ]);
    const apiUrl = validateApiUrl(await input('Base URL:', current.apiUrl || store.OPENAI_DEFAULT_BASE_URL));
    const apiKey = normalizeSecret(await password('OPENAI_API_KEY:', current.apiKey));
    if (!apiKey) throw new Error(t('common.apikey_required'));
    const model = validateModelId(await promptModel({
      type: 'codex', baseUrl: apiUrl, apiKey, currentModel: current.model,
    }));
    const newName = normalizeProfileName(await input(t('common.profile_name'), info.name));
    validateRename(info.name, newName);
    store.saveCodexProfileData(newName || info.name, { ...current, apiUrl, apiKey, model });
    if (newName && newName !== info.name) store.deleteCodexProfile(info.name);
    success(newName && newName !== info.name
      ? t('edit.renamed', { name: newName })
      : t('edit.updated', { name: info.name }));
    return;
  }

  const current = store.readClaudeProfile(info.name);
  panel('Edit profile', [
    ['Type', typeBadge(info.type)],
    ['Name', info.name],
    ['API key', maskSecret(current.apiKey)],
    ['Model', current.model || 'upstream default'],
    ['Endpoint', redactUrl(current.apiUrl)],
  ]);
  const apiUrl = info.type === 'deepseek'
    ? DEEPSEEK_BASE_URL
    : validateApiUrl(await input('ANTHROPIC_BASE_URL:', current.apiUrl || 'https://api.anthropic.com'));
  const apiKey = normalizeSecret(await password(
    info.type === 'deepseek' ? 'DeepSeek API Key:' : 'ANTHROPIC_AUTH_TOKEN:',
    current.apiKey,
  ));
  if (!apiKey) throw new Error(t('common.apikey_required'));
  const model = validateModelId(await promptModel({
    type: info.type,
    baseUrl: apiUrl,
    apiKey,
    currentModel: current.model,
  }));
  const newName = normalizeProfileName(await input(t('common.profile_name'), info.name));
  validateRename(info.name, newName);
  store.saveClaudeProfile(newName || info.name, { ...current, apiUrl, apiKey, model, type: info.type });
  if (newName && newName !== info.name) store.deleteClaudeProfile(info.name);
  success(newName && newName !== info.name
    ? t('edit.renamed', { name: newName })
    : t('edit.updated', { name: info.name }));
}
