import { profileChoice, panel, typeTag, pad, section } from '../ui.js';
import * as store from '../store.js';
import { t } from '../i18n.js';
import { select } from '../prompt.js';
import { cyan, gray, red, yellow, white, bold } from '../color.js';

function maskKey(key) {
  if (!key) return t('common.not_set');
  return key.length > 12 ? key.slice(0, 4) + '…' + key.slice(-4) : '••••••••';
}

export async function showCommand(args) {
  const all = store.getAllProfiles();
  if (all.length === 0) {
    console.log(yellow(t('common.no_profiles')));
    process.exit(0);
  }

  let profileInfo;

  if (!args[0]) {
    const choices = all.map((p, i) => profileChoice(p, i));
    profileInfo = await select(t('pick.show'), choices);
  } else {
    profileInfo = store.resolveProfile(args[0]);
    if (!profileInfo) {
      console.log(red(t('common.not_exist', { name: args[0] })));
      process.exit(1);
    }
  }

  const isCodex = profileInfo.type === 'codex';
  const profile = isCodex ? store.readCodexProfile(profileInfo.name) : store.readClaudeProfile(profileInfo.name);
  const credentials = isCodex ? store.getCodexCredentials(profileInfo.name) : store.getClaudeCredentials(profileInfo.name);
  console.log('\n' + panel([typeTag(profileInfo.type)], { title: `${bold(profileInfo.name)}` }));
  console.log();

  const fields = [
    [t('ui.endpoint'), credentials.baseUrl || credentials.apiUrl || t('common.not_set')],
    ['API Key', yellow(maskKey(credentials.apiKey))],
    ['Model', credentials.model || profile?.model || profile?.settings?.model || t('common.default')],
  ];
  if (isCodex) fields.push(['CODEX_HOME', store.getCodexProfileDir(profileInfo.name)]);
  for (const [label, value] of fields) console.log(`  ${pad(gray(label), 15)} ${white(value)}`);

  if (isCodex && profile?.configToml) {
    section('config.toml');
    for (const line of profile.configToml.split('\n')) console.log(`  ${gray(line)}`);
  }
  if (profile?.env && Object.keys(profile.env).length > 0) {
    section(t('show.extra_env'));
    for (const [key, value] of Object.entries(profile.env)) {
      const display = /(?:key|token|secret|password)/i.test(key) ? maskKey(String(value)) : value;
      console.log(`  ${cyan(key)}  ${gray(display)}`);
    }
  }
  if (profile?.settings && Object.keys(profile.settings).length > 0) {
    section(t('show.settings_overrides'));
    console.log(JSON.stringify(profile.settings, null, 2).split('\n').map((line) => `  ${gray(line)}`).join('\n'));
  }
  console.log();
}
