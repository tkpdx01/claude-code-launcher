import * as store from '../store.js';
import { t } from '../i18n.js';
import { status } from '../ui.js';

export function defaultCommand(args) {
  if (!args.length) { console.log(store.getDefaultProfileName() || t('common.not_set')); return; }
  if (args.length !== 1) throw new Error('Usage: ccc default [profile|--clear]');
  if (args[0] === '--clear') store.setDefaultProfile('');
  else {
    const profile = store.resolveProfile(args[0]);
    if (!profile) throw new Error(t('common.not_exist', { name: args[0] }));
    store.setDefaultProfile(profile.name);
  }
  status('success', t('default.saved', { name: store.getDefaultProfileName() || t('common.not_set') }));
}
