import { typeTag, status, hint, fail } from '../ui.js';
import * as store from '../store.js';
import { t } from '../i18n.js';
import { input, select } from '../prompt.js';
import { promptCodexModel } from '../models.js';
import { normalizeProfileName, validateProfileName } from '../profile-name.js';
import { applyAnyRouterProfile, isAnyRouterUrl } from '../anyrouter.js';
import { DEEPSEEK_BASE_URL, DEEPSEEK_MODELS, OPENAI_DEFAULT_BASE_URL } from '../providers.js';
import { cyan, gray } from '../color.js';
import { selectProfile, inputApiKey } from './shared.js';

const MANUAL_MODEL = '__manual__';

function maskKey(key) {
  return key ? `${key.substring(0, 10)}...` : t('common.not_set');
}

function showCurrent(name, type, fields) {
  console.log(cyan(`\n${t('edit.current', { name, tag: typeTag(type) })}:`));
  for (const [label, value] of fields) console.log(gray(`  ${label}: ${value}`));
  console.log();
}

// Ask for a new name; returns it only when it differs from the current one
// and is free, otherwise exits with the validation message.
async function promptRename(currentName) {
  const newName = normalizeProfileName(await input(t('common.profile_name'), currentName));
  if (!newName || newName === currentName) return null;
  const validation = validateProfileName(newName);
  if (validation !== true) fail(validation);
  if (store.anyProfileExists(newName).exists) fail(t('edit.exists', { name: newName }));
  return newName;
}

function saveClaudeLike(currentName, newName, updated) {
  if (newName) {
    store.saveClaudeProfile(newName, updated);
    store.deleteClaudeProfile(currentName);
    status('success', t('edit.renamed', { name: newName }));
  } else {
    store.saveClaudeProfile(currentName, updated);
    status('success', t('edit.updated', { name: currentName }));
  }
}

async function editCodex(name) {
  const { apiKey: curKey, baseUrl: curUrl, model: curModel } = store.getCodexCredentials(name);
  showCurrent(name, 'codex', [
    ['Base URL', curUrl || t('common.not_set')],
    ['OPENAI_API_KEY', maskKey(curKey)],
    ['Model', curModel || t('common.default')],
  ]);

  const baseUrl = await input('Base URL:', curUrl || OPENAI_DEFAULT_BASE_URL);
  const apiKey = await inputApiKey('OPENAI_API_KEY:', curKey);
  const newName = await promptRename(name);
  const model = await promptCodexModel(baseUrl, apiKey, curModel);

  store.updateCodexProfile(name, apiKey, baseUrl, model);
  if (newName) {
    const profile = store.readCodexProfile(name);
    store.saveCodexProfile(newName, profile.auth, profile.configToml);
    store.copyCodexProfileSupportFiles(name, store.getCodexProfileDir(newName));
    store.deleteCodexProfile(name);
    status('success', t('edit.renamed', { name: newName }));
  } else {
    status('success', t('edit.updated', { name }));
  }
}

async function editDeepseek(name) {
  const existing = store.readClaudeProfile(name) || {};
  const curKey = existing.apiKey || '';
  const curModel = existing.model || '';
  showCurrent(name, 'deepseek', [
    ['API Key', maskKey(curKey)],
    ['Model', curModel || t('common.default')],
  ]);

  const apiKey = await inputApiKey('DeepSeek API Key:', curKey);

  const choices = [...DEEPSEEK_MODELS, { name: t('models.manual'), value: MANUAL_MODEL }];
  const defaultIdx = Math.max(0, choices.findIndex((m) => m.value === curModel));
  let model = await select('Model:', choices, defaultIdx);
  if (model === MANUAL_MODEL) model = await input(t('models.prompt'), curModel);

  const newName = await promptRename(name);
  saveClaudeLike(name, newName, { ...existing, apiUrl: DEEPSEEK_BASE_URL, apiKey, model, type: 'deepseek' });
}

async function editClaude(name) {
  const existing = store.readClaudeProfile(name) || {};
  const curKey = existing.apiKey || '';
  const curUrl = existing.apiUrl || '';
  showCurrent(name, 'claude', [
    ['ANTHROPIC_BASE_URL', curUrl || t('common.not_set')],
    ['ANTHROPIC_AUTH_TOKEN', maskKey(curKey)],
  ]);

  const apiUrl = await input('ANTHROPIC_BASE_URL:', curUrl);
  const apiKey = await inputApiKey('ANTHROPIC_AUTH_TOKEN:', curKey);
  const newName = await promptRename(name);

  saveClaudeLike(name, newName, applyAnyRouterProfile({ ...existing, apiUrl, apiKey }));
  if (isAnyRouterUrl(apiUrl)) hint(t('new.anyrouter_1m'));
}

export async function editCommand(args) {
  const profileInfo = await selectProfile(args, 'pick.edit');
  if (profileInfo.type === 'codex') return editCodex(profileInfo.name);
  if (profileInfo.type === 'deepseek') return editDeepseek(profileInfo.name);
  return editClaude(profileInfo.name);
}
