import * as store from '../store.js';
import { t } from '../i18n.js';
import { confirm, select } from '../prompt.js';
import { success, typeBadge } from '../ui.js';

export async function deleteCommand(args) {
  const all = store.getAllProfiles();
  if (all.length === 0) throw new Error(t('common.no_profiles'));
  let profile;
  if (args[0]) {
    profile = store.resolveProfile(args[0]);
    if (!profile) throw new Error(t('common.not_exist', { name: args[0] }));
  } else {
    profile = await select(t('pick.delete'), all.map((item) => ({
      name: `${typeBadge(item.type)}  ${item.name}`,
      value: item,
    })));
  }
  if (!await confirm(t('delete.confirm', { type: profile.type, name: profile.name }), false)) return;
  if (profile.type === 'codex') store.deleteCodexProfile(profile.name);
  else store.deleteClaudeProfile(profile.name);
  success(t('delete.done', { type: profile.type, name: profile.name }));
}
