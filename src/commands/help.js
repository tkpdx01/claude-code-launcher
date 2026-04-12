import { cyan, yellow, gray, white, dim, bold } from '../color.js';

export function helpCommand() {
  console.log(bold(cyan('\n  CCC - Claude Code / Codex Settings Launcher\n')));
  console.log(white('  Manage multiple Claude Code and Codex profiles, switch API configs instantly\n'));

  console.log(yellow('  Launch:'));
  console.log(gray('    ccc                    ') + 'Launch default profile, or select interactively');
  console.log(gray('    ccc <profile>          ') + 'Launch by name or number (auto-detect type)');
  console.log(gray('    ccc <number>           ') + 'Launch by index (e.g. ccc 1)');
  console.log(gray('    ccc -d, --ddd          ') + 'Claude: --dangerously-skip-permissions / Codex: --full-auto');
  console.log();

  console.log(yellow('  Manage:'));
  console.log(gray('    ccc list, ls           ') + 'List all profiles (Claude + Codex, with index)');
  console.log(gray('    ccc show [profile]     ') + 'Show profile details');
  console.log(gray('    ccc use <profile>      ') + 'Set default profile');
  console.log(gray('    ccc new [name]         ') + 'Create new profile (Claude or Codex)');
  console.log(gray('    ccc edit [profile]     ') + 'Edit profile credentials');
  console.log(gray('    ccc apply [profile]    ') + 'Write credentials to ~/.claude or ~/.codex (for native launch)');
  console.log(gray('    ccc delete, rm [name]  ') + 'Delete profile');
  console.log(gray('    ccc help               ') + 'Show this help');
  console.log();

  console.log(yellow('  Storage:'));
  console.log(gray('    ~/.ccc/profiles/       ') + 'Claude profiles (credentials only)');
  console.log(gray('    ~/.ccc/codex-profiles/ ') + 'Codex profiles (auth.json + config.toml)');
  console.log(gray('    ~/.ccc/tmp/            ') + 'Temp merged settings (auto-generated at launch)');
  console.log();

  console.log(yellow('  How it works:'));
  console.log(dim('    Profiles store only API credentials. At launch time, ccc reads'));
  console.log(dim('    ~/.claude/settings.json (read-only), merges credentials, writes'));
  console.log(dim('    a temp file, and spawns claude/codex. No global config is modified.'));
  console.log();

  console.log(yellow('  Examples:'));
  console.log(gray('    ccc ls                 ') + 'List profiles with index numbers');
  console.log(gray('    ccc 3                  ') + 'Launch profile #3');
  console.log(gray('    ccc 3 -d               ') + 'Launch profile #3 with skip-permissions/full-auto');
  console.log(gray('    ccc apply myapi        ') + 'Write myapi credentials to main config for native launch');
  console.log();
}
