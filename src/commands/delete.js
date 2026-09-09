import { profileChoice, status } from '../ui.js';
import * as store from '../store.js';
import { t } from '../i18n.js';
import { confirm, select } from '../prompt.js';
import { red, yellow } from '../color.js';

export async function deleteCommand(args) {
  const all = store.getAllProfiles();
  if (all.length === 0) {
    console.log(yellow(t('common.no_profiles')));
    process.exit(0);
  }

  let profileInfo;

  if (!args[0]) {
    const choices = all.map((p, i) => profileChoice(p, i));
    profileInfo = await select(t('pick.delete'), choices);
  } else {
    profileInfo = store.resolveProfile(args[0]);
    if (!profileInfo) {
      console.log(red(t('common.not_exist', { name: args[0] })));
      process.exit(1);
    }
  }

  const typeLabel = profileInfo.type === 'codex' ? 'Codex' : profileInfo.type === 'deepseek' ? 'DeepSeek' : 'Claude';
  const ok = await confirm(t('delete.confirm', { type: typeLabel, name: profileInfo.name }), false);
  if (!ok) {
    console.log(yellow(t('common.cancelled')));
    process.exit(0);
  }

  if (profileInfo.type === 'codex') {
    store.deleteCodexProfile(profileInfo.name);
  } else {
    store.deleteClaudeProfile(profileInfo.name); // deepseek also stored in profiles/
  }

  status('success', t('delete.done', { type: typeLabel, name: profileInfo.name }));
}
