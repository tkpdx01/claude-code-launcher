import { typeTag, typeLabel, status, hint, fail } from '../ui.js';
import * as store from '../store.js';
import { t } from '../i18n.js';
import { input, confirm, select } from '../prompt.js';
import { promptCodexModel } from '../models.js';
import { normalizeProfileName, validateProfileName } from '../profile-name.js';
import { applyAnyRouterProfile, isAnyRouterUrl } from '../anyrouter.js';
import {
  ANTHROPIC_DEFAULT_BASE_URL,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODELS,
  OPENAI_DEFAULT_BASE_URL,
} from '../providers.js';
import { launchClaude } from '../claude.js';
import { launchCodex } from '../codex.js';
import { inputApiKey, cancel } from './shared.js';

// Claude and DeepSeek share profiles/<name>.json, Codex has its own directory.
// When the new profile lands in the other storage, drop the stale one so the
// name is never listed twice.
function removeReplaced(replaced, newType) {
  if (!replaced) return;
  const wasCodex = replaced.type === 'codex';
  if (wasCodex === (newType === 'codex')) return;
  if (wasCodex) store.deleteCodexProfile(replaced.name);
  else store.deleteClaudeProfile(replaced.name);
}

export async function newCommand(args) {
  let name = normalizeProfileName(args[0] || '');

  const profileType = await select(t('common.profile_type'), [
    { name: typeTag('claude') + ' Code', value: 'claude' },
    { name: typeTag('codex'), value: 'codex' },
    { name: typeTag('deepseek'), value: 'deepseek' },
  ]);

  if (!name) {
    name = normalizeProfileName(await input(t('common.profile_name')));
  }
  const v = validateProfileName(name);
  if (v !== true) fail(v);

  const existing = store.anyProfileExists(name);
  let replaced = null;
  if (existing.exists) {
    const overwrite = await confirm(t('new.exists', { name, type: typeLabel(existing.type) }), false);
    if (!overwrite) cancel();
    replaced = { name, type: existing.type };
  }

  if (profileType === 'codex') {
    const baseUrl = await input('Base URL:', OPENAI_DEFAULT_BASE_URL);
    const apiKey = await inputApiKey('OPENAI_API_KEY:');
    const model = await promptCodexModel(baseUrl, apiKey, '');

    store.createCodexProfile(name, apiKey, baseUrl, model);
    removeReplaced(replaced, 'codex');
    status('success', t('new.created_codex', { name }));

    if (await confirm(t('new.launch_codex'), false)) launchCodex(name);
  } else if (profileType === 'deepseek') {
    const apiKey = await inputApiKey('DeepSeek API Key:');
    const model = await select('Model:', DEEPSEEK_MODELS);

    store.saveClaudeProfile(name, { apiUrl: DEEPSEEK_BASE_URL, apiKey, model, type: 'deepseek' });
    removeReplaced(replaced, 'deepseek');
    status('success', t('new.created_deepseek', { name }));

    if (await confirm(t('new.launch_deepseek'), false)) launchClaude(name);
  } else {
    const apiUrl = await input('ANTHROPIC_BASE_URL:', ANTHROPIC_DEFAULT_BASE_URL);
    const apiKey = await inputApiKey('ANTHROPIC_AUTH_TOKEN:');

    store.saveClaudeProfile(name, applyAnyRouterProfile({ apiUrl, apiKey }, { setDefaultModel: true }));
    removeReplaced(replaced, 'claude');
    status('success', t('new.created_claude', { name }));
    if (isAnyRouterUrl(apiUrl)) hint(t('new.anyrouter_1m'));

    if (await confirm(t('new.launch_claude'), false)) launchClaude(name);
  }
}
