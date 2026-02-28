import chalk from 'chalk';
import Table from 'cli-table3';
import { getAllProfiles, getDefaultProfile, getProfileCredentials, getCodexProfileCredentials } from '../profiles.js';

export function listCommand(program) {
  program
    .command('list')
    .alias('ls')
    .description('列出所有 profiles')
    .action(() => {
      const allProfiles = getAllProfiles();
      const defaultProfile = getDefaultProfile();

      if (allProfiles.length === 0) {
        console.log(chalk.yellow('没有可用的 profiles'));
        console.log(chalk.gray('使用 "ccc new" 创建配置'));
        return;
      }

      const table = new Table({
        head: [chalk.cyan('#'), chalk.cyan('类型'), chalk.cyan('Profile'), chalk.cyan('API URL')],
        style: { head: [], border: [] },
        chars: {
          'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
          'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
          'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
          'right': '│', 'right-mid': '┤', 'middle': '│'
        }
      });

      allProfiles.forEach((p, index) => {
        const isDefault = p.name === defaultProfile;

        let apiUrl;
        if (p.type === 'codex') {
          const creds = getCodexProfileCredentials(p.name);
          apiUrl = creds.baseUrl || chalk.gray('(未设置)');
        } else {
          const creds = getProfileCredentials(p.name);
          apiUrl = creds.apiUrl || chalk.gray('(未设置)');
        }

        const num = isDefault ? chalk.green(`${index + 1}`) : chalk.gray(`${index + 1}`);
        const typeTag = p.type === 'codex' ? chalk.blue('Codex') : chalk.magenta('Claude');
        const name = isDefault ? chalk.green(`${p.name} *`) : p.name;
        table.push([num, typeTag, name, apiUrl]);
      });

      console.log();
      console.log(table.toString());
      console.log(chalk.gray(`\n  共 ${allProfiles.length} 个配置，* 表示默认，可用序号或名称启动\n`));
    });
}
