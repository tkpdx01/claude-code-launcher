import chalk from 'chalk';
import Table from 'cli-table3';
import { getProfiles, getDefaultProfile, getProfilePath, readProfile } from '../profiles.js';

export function listCommand(program) {
  program
    .command('list')
    .alias('ls')
    .description('列出所有 profiles')
    .action(() => {
      const profiles = getProfiles();
      const defaultProfile = getDefaultProfile();

      if (profiles.length === 0) {
        console.log(chalk.yellow('没有可用的 profiles'));
        console.log(chalk.gray('使用 "ccc import" 导入配置'));
        return;
      }

      const table = new Table({
        head: [chalk.cyan('#'), chalk.cyan('Profile'), chalk.cyan('API URL')],
        style: { head: [], border: [] },
        chars: {
          'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
          'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
          'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
          'right': '│', 'right-mid': '┤', 'middle': '│'
        }
      });

      profiles.forEach((p, index) => {
        const isDefault = p === defaultProfile;
        const settings = readProfile(p);
        let apiUrl = chalk.gray('(未设置)');

        if (settings) {
          apiUrl = settings.apiUrl || chalk.gray('(未设置)');
        } else {
          apiUrl = chalk.red('(读取失败)');
        }

        const num = isDefault ? chalk.green(`${index + 1}`) : chalk.gray(`${index + 1}`);
        const name = isDefault ? chalk.green(`${p} *`) : p;
        table.push([num, name, apiUrl]);
      });

      console.log();
      console.log(table.toString());
      console.log(chalk.gray(`\n  共 ${profiles.length} 个配置，* 表示默认，可用序号或名称启动\n`));
    });
}

