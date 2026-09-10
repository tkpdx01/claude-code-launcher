import { typeTag, status, hint } from '../ui.js';
import * as store from '../store.js';
import { t } from '../i18n.js';
import { input, confirm, select } from '../prompt.js';
import { promptCodexModel } from '../models.js';
import { normalizeProfileName, validateProfileName } from '../profile-name.js';
import { applyAnyRouterProfile, isAnyRouterUrl } from '../anyrouter.js';
import { red, yellow } from '../color.js';
import { launchClaude } from '../claude.js';
import { launchCodex } from '../codex.js';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/anthropic';
const DEEPSEEK_MODELS = [
  { name: 'deepseek-chat (V3)', value: 'deepseek-chat' },
  { name: 'deepseek-reasoner (R1)', value: 'deepseek-reasoner' },
];

export async function newCommand(args) {
  let name = normalizeProfileName(args[0] || '');
  let replacedProfile = null;

  const profileType = await select(t('common.profile_type'), [
    { name: typeTag('claude') + ' Code', value: 'claude' },
    { name: typeTag('codex'), value: 'codex' },
    { name: typeTag('deepseek'), value: 'deepseek' },
  ]);

  if (!name) {
    name = normalizeProfileName(await input(t('common.profile_name')));
  }
  const v = validateProfileName(name);
  if (v !== true) {
    console.log(red(v));
    process.exit(1);
  }

  const existing = store.anyProfileExists(name);
  if (existing.exists) {
    const typeLabel = existing.type === 'codex' ? 'Codex' : existing.type === 'deepseek' ? 'DeepSeek' : 'Claude';
    const overwrite = await confirm(t('new.exists', { name, type: typeLabel }), false);
    if (!overwrite) {
      console.log(yellow(t('common.cancelled')));
      process.exit(0);
    }
    if (existing.type !== profileType) {
      replacedProfile = { name, type: existing.type };
    }
  }

  if (profileType === 'codex') {
    const baseUrl = await input('Base URL:', 'https://api.openai.com/v1');
    const apiKey = await input('OPENAI_API_KEY:');
    if (!apiKey) {
      console.log(red(t('common.apikey_required')));
      process.exit(1);
    }
    const model = await promptCodexModel(baseUrl, apiKey, '');

    store.ensureDirs();
    store.createCodexProfile(name, apiKey, baseUrl, model);
    if (replacedProfile?.type === 'claude' || replacedProfile?.type === 'deepseek') store.deleteClaudeProfile(replacedProfile.name);
    status('success', t('new.created_codex', { name }));

    if (await confirm(t('new.launch_codex'), false)) {
      launchCodex(name);
    }
  } else if (profileType === 'deepseek') {
    const apiKey = await input('DeepSeek API Key:');
    if (!apiKey) {
      console.log(red(t('common.apikey_required')));
      process.exit(1);
    }
    const model = await select('Model:', DEEPSEEK_MODELS);

    store.ensureDirs();
    store.saveClaudeProfile(name, { apiUrl: DEEPSEEK_BASE_URL, apiKey, model, type: 'deepseek' });
    if (replacedProfile?.type === 'codex') store.deleteCodexProfile(replacedProfile.name);
    status('success', t('new.created_deepseek', { name }));

    if (await confirm(t('new.launch_deepseek'), false)) {
      launchClaude(name);
    }
  } else {
    const apiUrl = await input('ANTHROPIC_BASE_URL:', 'https://api.anthropic.com');
    const apiKey = await input('ANTHROPIC_AUTH_TOKEN:');
    if (!apiKey) {
      console.log(red(t('common.apikey_required')));
      process.exit(1);
    }

    store.ensureDirs();
    store.saveClaudeProfile(name, applyAnyRouterProfile({ apiUrl, apiKey }, { setDefaultModel: true }));
    if (replacedProfile?.type === 'codex') store.deleteCodexProfile(replacedProfile.name);
    status('success', t('new.created_claude', { name }));
    if (isAnyRouterUrl(apiUrl)) hint(t('new.anyrouter_1m'));

    if (await confirm(t('new.launch_claude'), false)) {
      launchClaude(name);
    }
  }
}
