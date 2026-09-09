import { t } from '../i18n.js';
import { cyan, gray, bold } from '../color.js';
import { panel, section, columns, clip, pad } from '../ui.js';

function commands(rows) {
  for (const [command, description] of rows) {
    if (process.stdout.isTTY && columns() < 68) {
      console.log(`  ${cyan(command)}`);
      console.log(`    ${clip(gray(description), columns() - 2)}`);
    } else {
      console.log(`  ${pad(cyan(command), 29)}${description}`);
    }
  }
}

export function helpCommand() {
  console.log('\n' + panel([gray('Claude Code · Codex · DeepSeek')], { title: `${cyan('◆')} ${bold('CCC')} / ${t('ui.workspace')}` }));
  section(t('help.interactive'));
  commands([['ccc', t('help.interactive.ccc')]]);
  section(t('help.quick'));
  commands([
    ['ccc <profile>', t('help.quick.name')],
    ['ccc <number>', t('help.quick.number')],
    ['ccc <profile> -d', t('help.quick.ddd')],
    ['ccc <profile> -- <args>', t('help.quick.args')],
  ]);
  section(t('help.commands'));
  commands([
    ['ccc list, ls', t('help.cmd.list')],
    ['ccc new [name]', t('help.cmd.new')],
    ['ccc edit [profile]', t('help.cmd.edit')],
    ['ccc show [profile]', t('help.cmd.show')],
    ['ccc apply [profile]', t('help.cmd.apply')],
    ['ccc delete [profile]', t('help.cmd.delete')],
  ]);
  console.log();
}
