import * as store from '../store.js';
import { t } from '../i18n.js';
import { confirm, select } from '../prompt.js';
import { green, red, yellow, blue, magenta } from '../color.js';

export async function deleteCommand(args) {
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
    profileInfo = await select(t('pick.delete'), choices);
  } else {
    profileInfo = store.resolveProfile(args[0]);
    if (!profileInfo) {
      console.log(red(t('common.not_exist', { name: args[0] })));
      process.exit(1);
    }
  }

  const typeLabel = profileInfo.type === 'codex' ? 'Codex' : 'Claude';
  const ok = await confirm(t('delete.confirm', { type: typeLabel, name: profileInfo.name }), false);
  if (!ok) {
    console.log(yellow(t('common.cancelled')));
    process.exit(0);
  }

  if (profileInfo.type === 'codex') {
    store.deleteCodexProfile(profileInfo.name);
  } else {
    store.deleteClaudeProfile(profileInfo.name);
  }

  console.log(green(t('delete.done', { type: typeLabel, name: profileInfo.name })));
}
