import { cyan, yellow, gray, dim, bold } from '../color.js';

export function helpCommand() {
  console.log(bold(cyan('\n  CCC')) + dim(' — Claude Code / Codex Launcher\n'));

  console.log(yellow('  Interactive:'));
  console.log(gray('    ccc                    ') + 'Main menu (launch, apply, manage)');
  console.log();

  console.log(yellow('  Quick launch:'));
  console.log(gray('    ccc <profile>          ') + 'Launch by name');
  console.log(gray('    ccc <number>           ') + 'Launch by index');
  console.log(gray('    ccc <profile> -d       ') + '--dangerously-skip-permissions / --full-auto');
  console.log();

  console.log(yellow('  Commands:'));
  console.log(gray('    ccc list, ls           ') + 'List all profiles');
  console.log(gray('    ccc new [name]         ') + 'Create profile');
  console.log(gray('    ccc edit [profile]     ') + 'Edit credentials');
  console.log(gray('    ccc show [profile]     ') + 'View details');
  console.log(gray('    ccc apply [profile]    ') + 'Write to main config (for native launch)');
  console.log(gray('    ccc delete [profile]   ') + 'Remove profile');
  console.log();
}
