import * as store from '../store.js';
import { t } from '../i18n.js';
import { confirm } from '../prompt.js';
import { status, typeLabel } from '../ui.js';
import { selectProfile, cancel } from './shared.js';
import { archiveProfiles } from '../recovery.js';

export async function deleteCommand(args) {
  const profileInfo = await selectProfile(args, 'pick.delete');

  const type = typeLabel(profileInfo.type);
  const ok = await confirm(t('delete.confirm', { type, name: profileInfo.name }), false);
  if (!ok) return cancel();

  const id = archiveProfiles(store.profilePaths([profileInfo]), [profileInfo.name]);

  status('success', t('delete.done', { type, name: profileInfo.name }));
  status('success', t('recovery.saved', { id }));
}
