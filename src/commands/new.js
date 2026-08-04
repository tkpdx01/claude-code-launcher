import * as store from '../store.js';
import { t } from '../i18n.js';
import { confirm, input, password, select } from '../prompt.js';
import { promptModel } from '../models.js';
import { normalizeProfileName, validateProfileName } from '../profile-name.js';
import { launchClaude } from '../claude.js';
import { launchCodex } from '../codex.js';
import { panel, redactUrl, success, typeBadge, warning } from '../ui.js';
import { normalizeSecret, validateApiUrl, validateModelId } from '../validation.js';
import {
  codexModelCatalogConflictMessage,
  inspectNativeCodexModelCatalog,
} from '../codex-catalog.js';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/anthropic';

function parseOptions(args) {
  const options = { name: '', type: '', apiUrl: '', model: '', apiKeyEnv: '' };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--type') options.type = args[++index] || '';
    else if (arg === '--url' || arg === '--base-url') options.apiUrl = args[++index] || '';
    else if (arg === '--model') options.model = args[++index] || '';
    else if (arg === '--api-key-env') options.apiKeyEnv = args[++index] || '';
    else if (!arg.startsWith('-') && !options.name) options.name = arg;
  }
  return options;
}

async function readApiKey(label, options) {
  if (options.apiKeyEnv) return normalizeSecret(process.env[options.apiKeyEnv]);
  return normalizeSecret(await password(label));
}

export async function newCommand(args) {
  const options = parseOptions(args);
  let name = normalizeProfileName(options.name);
  const allowedTypes = new Set(['claude', 'codex', 'deepseek']);
  if (options.type && !allowedTypes.has(options.type)) {
    throw new Error(`Unsupported profile type: ${options.type}`);
  }
  let profileType = options.type;
  if (!profileType) {
    profileType = await select(t('common.profile_type'), [
      { name: `${typeBadge('claude')}  Claude Code`, value: 'claude' },
      { name: `${typeBadge('codex')}  OpenAI Codex`, value: 'codex' },
      { name: `${typeBadge('deepseek')}  DeepSeek via Claude Code`, value: 'deepseek' },
    ]);
  }

  if (!name) name = normalizeProfileName(await input(t('common.profile_name')));
  const validation = validateProfileName(name);
  if (validation !== true) throw new Error(validation);

  const existing = store.anyProfileExists(name);
  if (existing.exists) {
    const overwrite = await confirm(t('new.exists', { name, type: existing.type }), false);
    if (!overwrite) return;
  }

  if (profileType === 'codex') {
    const apiUrl = validateApiUrl(options.apiUrl || await input('Base URL:', store.OPENAI_DEFAULT_BASE_URL));
    const apiKey = await readApiKey('OPENAI_API_KEY:', options);
    if (!apiKey) throw new Error(t('common.apikey_required'));
    const model = validateModelId(options.model || await promptModel({ type: 'codex', baseUrl: apiUrl, apiKey }));
    store.createCodexProfile(name, apiKey, apiUrl, model);
    if (existing.type === 'claude' || existing.type === 'deepseek') store.deleteClaudeProfile(name);
    const catalog = inspectNativeCodexModelCatalog(model);
    if (!catalog.compatible) {
      warning(codexModelCatalogConflictMessage(catalog, model, name));
    }
    success(t('new.created_codex', { name }));
    panel('Profile ready', [
      ['Type', typeBadge('codex')],
      ['Name', name],
      ['Model', model || 'upstream default'],
      ['Endpoint', redactUrl(apiUrl)],
    ], 'success');
    if (await confirm(t('new.launch_codex'), false)) launchCodex(name);
    return;
  }

  if (profileType === 'deepseek') {
    const apiKey = await readApiKey('DeepSeek API Key:', options);
    if (!apiKey) throw new Error(t('common.apikey_required'));
    const model = validateModelId(options.model || await promptModel({
      type: 'deepseek',
      baseUrl: DEEPSEEK_BASE_URL,
      apiKey,
    }));
    store.saveClaudeProfile(name, {
      type: 'deepseek',
      apiUrl: DEEPSEEK_BASE_URL,
      apiKey,
      model,
    });
    if (existing.type === 'codex') store.deleteCodexProfile(name);
    success(t('new.created_deepseek', { name }));
    panel('Profile ready', [
      ['Type', typeBadge('deepseek')],
      ['Name', name],
      ['Model', model || 'upstream default'],
      ['Endpoint', redactUrl(DEEPSEEK_BASE_URL)],
    ], 'success');
    if (await confirm(t('new.launch_deepseek'), false)) launchClaude(name);
    return;
  }

  const apiUrl = validateApiUrl(options.apiUrl || await input('ANTHROPIC_BASE_URL:', 'https://api.anthropic.com'));
  const apiKey = await readApiKey('ANTHROPIC_AUTH_TOKEN:', options);
  if (!apiKey) throw new Error(t('common.apikey_required'));
  const model = validateModelId(options.model || await promptModel({ type: 'claude', baseUrl: apiUrl, apiKey }));
  store.saveClaudeProfile(name, { apiUrl, apiKey, model });
  if (existing.type === 'codex') store.deleteCodexProfile(name);
  success(t('new.created_claude', { name }));
  panel('Profile ready', [
    ['Type', typeBadge('claude')],
    ['Name', name],
    ['Model', model || 'upstream default'],
    ['Endpoint', redactUrl(apiUrl)],
  ], 'success');
  if (await confirm(t('new.launch_claude'), false)) launchClaude(name);
}
