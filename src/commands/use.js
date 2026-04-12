import * as store from '../store.js';
import { green, red, yellow, blue, magenta } from '../color.js';

export function useCommand(args) {
  const name = args[0];
  if (!name) {
    console.log(yellow('Usage: ccc use <profile>'));
    process.exit(1);
  }

  const resolved = store.resolveProfile(name);
  if (!resolved) {
    console.log(red(`Profile "${name}" does not exist`));
    console.log(yellow('Use "ccc list" to see available profiles'));
    process.exit(1);
  }

  const tag = resolved.type === 'codex' ? blue('[Codex]') : magenta('[Claude]');
  store.setDefault(resolved.name);
  console.log(green(`Default set to ${tag} "${resolved.name}"`));
}
