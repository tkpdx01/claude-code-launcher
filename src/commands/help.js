import { t } from '../i18n.js';
import { cyan, yellow, gray, dim, bold } from '../color.js';

export function helpCommand() {
  console.log(bold(cyan('\n  CCC')) + dim(' — Claude Code / Codex Launcher\n'));

  console.log(yellow(`  ${t('help.interactive')}`));
  console.log(gray('    ccc                    ') + t('help.interactive.ccc'));
  console.log();

  console.log(yellow(`  ${t('help.quick')}`));
  console.log(gray('    ccc <profile>          ') + t('help.quick.name'));
  console.log(gray('    ccc <number>           ') + t('help.quick.number'));
  console.log(gray('    ccc <profile> -d       ') + t('help.quick.ddd'));
  console.log();

  console.log(yellow(`  ${t('help.commands')}`));
  console.log(gray('    ccc list, ls           ') + t('help.cmd.list'));
  console.log(gray('    ccc new [name]         ') + t('help.cmd.new'));
  console.log(gray('    ccc edit [profile]     ') + t('help.cmd.edit'));
  console.log(gray('    ccc show [profile]     ') + t('help.cmd.show'));
  console.log(gray('    ccc apply [profile]    ') + t('help.cmd.apply'));
  console.log(gray('    ccc delete [profile]   ') + t('help.cmd.delete'));
  console.log();
}
