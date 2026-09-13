import { panel, typeTag, pad, section } from '../ui.js';
import * as store from '../store.js';
import { t } from '../i18n.js';
import { cyan, gray, yellow, white, bold } from '../color.js';
import { selectProfile } from './shared.js';

function maskKey(key) {
  if (!key) return t('common.not_set');
  return key.length > 12 ? key.slice(0, 4) + '…' + key.slice(-4) : '••••••••';
}

export async function showCommand(args) {
  const profileInfo = await selectProfile(args, 'pick.show');

  const isCodex = profileInfo.type === 'codex';
  const profile = isCodex ? store.readCodexProfile(profileInfo.name) : store.readClaudeProfile(profileInfo.name);
  const credentials = isCodex
    ? store.getCodexCredentials(profileInfo.name)
    : { apiKey: profile?.apiKey || '', apiUrl: profile?.apiUrl || '' };
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
