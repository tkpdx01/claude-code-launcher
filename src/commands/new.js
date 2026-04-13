import * as store from '../store.js';
import { t } from '../i18n.js';
import { input, confirm, select } from '../prompt.js';
import { promptCodexModel } from '../models.js';
import { normalizeProfileName, validateProfileName } from '../profile-name.js';
import { green, red, yellow, blue, magenta } from '../color.js';
import { launchClaude } from '../claude.js';
import { launchCodex } from '../codex.js';

export async function newCommand(args) {
  let name = normalizeProfileName(args[0] || '');
  let replacedProfile = null;

  const profileType = await select(t('common.profile_type'), [
    { name: `${magenta('[Claude]')} Claude Code`, value: 'claude' },
    { name: `${blue('[Codex]')}  OpenAI Codex`, value: 'codex' },
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
    const typeLabel = existing.type === 'codex' ? 'Codex' : 'Claude';
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
    const model = await promptCodexModel(baseUrl, apiKey, '');

    store.ensureDirs();
    store.createCodexProfile(name, apiKey, baseUrl, model);
    if (replacedProfile?.type === 'claude') store.deleteClaudeProfile(replacedProfile.name);
    console.log(green(`\n${t('new.created_codex', { name })}`));

    if (await confirm(t('new.launch_codex'), false)) {
      launchCodex(name);
    }
  } else {
    const apiUrl = await input('ANTHROPIC_BASE_URL:', 'https://api.anthropic.com');
    const apiKey = await input('ANTHROPIC_AUTH_TOKEN:');

    store.ensureDirs();
    store.saveClaudeProfile(name, { apiUrl, apiKey });
    if (replacedProfile?.type === 'codex') store.deleteCodexProfile(replacedProfile.name);
    console.log(green(`\n${t('new.created_claude', { name })}`));

    if (await confirm(t('new.launch_claude'), false)) {
      launchClaude(name);
    }
  }
}
