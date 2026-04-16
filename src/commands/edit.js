import * as store from '../store.js';
import { t } from '../i18n.js';
import { input, select } from '../prompt.js';
import { promptCodexModel } from '../models.js';
import { normalizeProfileName, validateProfileName } from '../profile-name.js';
import { cyan, green, gray, red, yellow, blue, magenta } from '../color.js';

export async function editCommand(args) {
  const all = store.getAllProfiles();
  if (all.length === 0) {
    console.log(yellow(t('common.no_profiles')));
    process.exit(0);
  }

  let profileInfo;

  if (!args[0]) {
    const choices = all.map((p) => {
      const tag = p.type === 'codex' ? blue('[Codex]') : magenta('[Claude]');
      return { name: `${tag} ${p.name}`, value: p };
    });
    profileInfo = await select(t('pick.edit'), choices);
  } else {
    profileInfo = store.resolveProfile(args[0]);
    if (!profileInfo) {
      console.log(red(t('common.not_exist', { name: args[0] })));
      process.exit(1);
    }
  }

  if (profileInfo.type === 'codex') {
    const { apiKey: curKey, baseUrl: curUrl, model: curModel } = store.getCodexCredentials(profileInfo.name);

    console.log(cyan(`\n${t('edit.current', { name: profileInfo.name, tag: blue('[Codex]') })}:`));
    console.log(gray(`  Base URL: ${curUrl || t('common.not_set')}`));
    console.log(gray(`  OPENAI_API_KEY: ${curKey ? curKey.substring(0, 10) + '...' : t('common.not_set')}`));
    console.log(gray(`  Model: ${curModel || t('common.default')}`));
    console.log();

    const baseUrl = await input('Base URL:', curUrl || 'https://api.openai.com/v1');
    const apiKey = await input('OPENAI_API_KEY:', curKey || '');
    if (!apiKey) {
      console.log(red(t('common.apikey_required')));
      process.exit(1);
    }
    const newName = normalizeProfileName(await input(t('common.profile_name'), profileInfo.name));
    const model = await promptCodexModel(baseUrl, apiKey, curModel || '');

    if (newName && newName !== profileInfo.name) {
      const validation = validateProfileName(newName);
      if (validation !== true) {
        console.log(red(validation));
        process.exit(1);
      }
      const check = store.anyProfileExists(newName);
      if (check.exists) {
        console.log(red(t('edit.exists', { name: newName })));
        process.exit(1);
      }
      store.createCodexProfile(newName, apiKey, baseUrl, model);
      store.deleteCodexProfile(profileInfo.name);
      console.log(green(`\n${t('edit.renamed', { name: newName })}`));
    } else {
      store.createCodexProfile(profileInfo.name, apiKey, baseUrl, model);
      console.log(green(`\n${t('edit.updated', { name: profileInfo.name })}`));
    }
  } else {
    const existing = store.readClaudeProfile(profileInfo.name) || {};
    const { apiKey: curKey, apiUrl: curUrl } = store.getClaudeCredentials(profileInfo.name);

    console.log(cyan(`\n${t('edit.current', { name: profileInfo.name, tag: magenta('[Claude]') })}:`));
    console.log(gray(`  ANTHROPIC_BASE_URL: ${curUrl || t('common.not_set')}`));
    console.log(gray(`  ANTHROPIC_AUTH_TOKEN: ${curKey ? curKey.substring(0, 10) + '...' : t('common.not_set')}`));
    console.log();

    const apiUrl = await input('ANTHROPIC_BASE_URL:', curUrl || '');
    const apiKey = await input('ANTHROPIC_AUTH_TOKEN:', curKey || '');
    if (!apiKey) {
      console.log(red(t('common.apikey_required')));
      process.exit(1);
    }
    const newName = normalizeProfileName(await input(t('common.profile_name'), profileInfo.name));

    const updated = { ...existing, apiUrl, apiKey };

    if (newName && newName !== profileInfo.name) {
      const validation = validateProfileName(newName);
      if (validation !== true) {
        console.log(red(validation));
        process.exit(1);
      }
      const check = store.anyProfileExists(newName);
      if (check.exists) {
        console.log(red(t('edit.exists', { name: newName })));
        process.exit(1);
      }
      store.saveClaudeProfile(newName, updated);
      store.deleteClaudeProfile(profileInfo.name);
      console.log(green(`\n${t('edit.renamed', { name: newName })}`));
    } else {
      store.saveClaudeProfile(profileInfo.name, updated);
      console.log(green(`\n${t('edit.updated', { name: profileInfo.name })}`));
    }
  }
}
