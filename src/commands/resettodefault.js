import chalk from 'chalk';
import inquirer from 'inquirer';
import { resetCodexDefaultProfile } from '../profiles.js';

export function resetToDefaultCommand(program) {
  program
    .command('resettodefault')
    .description('恢复 apply 前的 ~/.codex 配置，并还原 OPENAI 相关环境变量变更')
    .action(async () => {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: '恢复 ~/.codex 到 apply 前状态，并还原 OPENAI 环境变量变更？',
          default: false
        }
      ]);

      if (!confirm) {
        console.log(chalk.yellow('已取消'));
        process.exit(0);
      }

      const result = resetCodexDefaultProfile();
      if (!result.success) {
        if (result.reason === 'no_backup') {
          console.log(chalk.yellow('未找到可恢复的备份（请先执行一次 ccc apply <codex-profile>）'));
          process.exit(0);
        }
        console.log(chalk.red('恢复失败：备份状态文件损坏'));
        process.exit(1);
      }

      const home = process.env.HOME || '';
      const rcPathDisplay = home && result.shellRcPath.startsWith(home)
        ? `~${result.shellRcPath.slice(home.length)}`
        : result.shellRcPath;

      console.log(chalk.green('✓ 已恢复 ~/.codex 原始配置'));
      console.log(chalk.green(`✓ 已还原 ${rcPathDisplay} 中的 OPENAI 环境变量变更`));
    });
}
