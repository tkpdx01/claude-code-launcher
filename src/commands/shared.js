// Helpers shared by the profile commands: argument resolution, prompts, and exits.
import * as store from '../store.js';
import { t } from '../i18n.js';
import { input, select } from '../prompt.js';
import { profileChoice, fail } from '../ui.js';
import { yellow } from '../color.js';

// Resolve the profile named by the first argument, or offer an interactive
// pick. Exits when there is nothing to choose from or the name is unknown.
export async function selectProfile(args, messageKey, all = store.getAllProfiles()) {
  if (all.length === 0) {
    console.log(yellow(t('common.no_profiles')));
    process.exit(0);
  }
  if (!args[0]) return select(t(messageKey), all.map(profileChoice));
  const resolved = store.resolveProfile(args[0]);
  if (!resolved) fail(t('common.not_exist', { name: args[0] }));
  return resolved;
}

export async function inputApiKey(message, current = '') {
  const value = await input(message, current);
  if (!value) fail(t('common.apikey_required'));
  return value;
}

export function cancel() {
  console.log(yellow(t('common.cancelled')));
  process.exit(0);
}
