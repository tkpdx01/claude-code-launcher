import * as store from '../store.js';
import { t } from '../i18n.js';
import { select } from '../prompt.js';
import { gray } from '../color.js';
import { maskSecret, panel, redactSecrets, redactUrl, typeBadge } from '../ui.js';

async function chooseProfile(args) {
  const all = store.getAllProfiles();
  if (all.length === 0) throw new Error(t('common.no_profiles'));
  if (args[0]) {
    const profile = store.resolveProfile(args[0]);
    if (!profile) throw new Error(t('common.not_exist', { name: args[0] }));
    return profile;
  }
  return select(t('pick.show'), all.map((profile) => ({
    name: `${typeBadge(profile.type)}  ${profile.name}`,
    value: profile,
  })));
}

export async function showCommand(args) {
  const info = await chooseProfile(args);
  if (info.type === 'codex') {
    const profile = store.readCodexProfileData(info.name);
    const source = store.readCodexProfile(info.name)?.source || 'unknown';
    panel('Profile', [
      ['Type', typeBadge('codex')],
      ['Name', info.name],
      ['API key', maskSecret(profile.apiKey)],
      ['Model', profile.model || t('common.default')],
      ['Endpoint', redactUrl(profile.apiUrl)],
      ['Wire API', profile.wireApi],
      ['Storage', source],
    ]);
    return;
  }

  const profile = store.readClaudeProfile(info.name);
  panel('Profile', [
    ['Type', typeBadge(info.type)],
    ['Name', info.name],
    ['API key', maskSecret(profile.apiKey)],
    ['Model', profile.model || t('common.default')],
    ['Endpoint', redactUrl(profile.apiUrl || t('common.not_set'))],
  ]);
  if (profile.env && Object.keys(profile.env).length > 0) {
    console.log(`\n  ${t('show.extra_env')}`);
    console.log(gray(JSON.stringify(redactSecrets(profile.env), null, 2).split('\n').join('\n  ')));
  }
  if (profile.settings && Object.keys(profile.settings).length > 0) {
    console.log(`\n  ${t('show.settings_overrides')}`);
    console.log(gray(JSON.stringify(redactSecrets(profile.settings), null, 2).split('\n').join('\n  ')));
  }
  console.log();
}
