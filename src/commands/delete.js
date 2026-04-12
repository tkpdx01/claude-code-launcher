import * as store from '../store.js';
import { confirm, select } from '../prompt.js';
import { green, red, yellow, blue, magenta } from '../color.js';

export async function deleteCommand(args) {
  const all = store.getAllProfiles();
  if (all.length === 0) {
    console.log(yellow('No profiles available'));
    process.exit(0);
  }

  let profileInfo;

  if (!args[0]) {
    const choices = all.map((p) => {
      const tag = p.type === 'codex' ? blue('[Codex]') : magenta('[Claude]');
      return { name: `${tag} ${p.name}`, value: p };
    });
    profileInfo = await select('Select profile to delete:', choices);
  } else {
    profileInfo = store.resolveProfile(args[0]);
    if (!profileInfo) {
      console.log(red(`Profile "${args[0]}" does not exist`));
      process.exit(1);
    }
  }

  const typeLabel = profileInfo.type === 'codex' ? 'Codex' : 'Claude';
  const ok = await confirm(`Delete ${typeLabel} profile "${profileInfo.name}"?`, false);
  if (!ok) {
    console.log(yellow('Cancelled'));
    process.exit(0);
  }

  if (profileInfo.type === 'codex') {
    store.deleteCodexProfile(profileInfo.name);
  } else {
    store.deleteClaudeProfile(profileInfo.name);
  }

  if (store.getDefault() === profileInfo.name) store.clearDefault();

  console.log(green(`Deleted ${typeLabel} profile "${profileInfo.name}"`));
}
