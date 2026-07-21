import { blue, bold, cyan, dim, gray, green, magenta, yellow } from '../color.js';
import { brand } from '../ui.js';

function row(command, description) {
  console.log(`    ${gray(command.padEnd(38))}${description}`);
}

export function helpCommand(version = '') {
  brand(version, 'Profile-aware launcher for Claude Code and Codex');

  console.log(`  ${bold(cyan('Launch'))}`);
  row('ccc <profile> [args...]', 'Launch and forward all upstream arguments');
  row('ccc <profile> -d [args...]', yellow('Full access mode'));
  row('ccc <profile> -- [args...]', 'Literal passthrough after --');
  row('ccc', 'Open the interactive dashboard');
  console.log();

  console.log(`  ${bold(magenta('Profiles'))}`);
  row('ccc new [name]', 'Create a profile');
  row('ccc edit [profile]', 'Edit credentials and model');
  row('ccc list, ls', 'List profiles');
  row('ccc show [profile]', 'Show redacted profile details');
  row('ccc delete, rm [profile]', 'Delete profile credentials');
  console.log();

  console.log(`  ${bold(blue('Models & health'))}`);
  row('ccc models [profile] --refresh', 'Discover models from the endpoint');
  row('ccc model <profile> [model-id]', 'Set an arbitrary model ID');
  row('ccc doctor [--json]', 'Check binaries, config and permissions');
  row('ccc apply [profile] [--dry-run]', 'Safely apply to native config');
  console.log();

  console.log(`  ${bold(green('Examples'))}`);
  console.log(dim('    ccc work --model fable --debug api'));
  console.log(dim('    ccc codex-prod -d -m gpt-5.6-terra -C "/repo path"'));
  console.log(dim('    ccc codex-prod -c model_reasoning_effort="high" "review this"'));
  console.log();
  console.log(`  ${yellow('Warning:')} ${dim('-d disables Claude permissions or Codex approvals and sandboxing.')}`);
  console.log();
}
