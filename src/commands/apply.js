import chalk from 'chalk';
import inquirer from 'inquirer';
import {
  getAllProfiles,
  resolveAnyProfile,
  applyClaudeProfile,
  applyCodexProfile
} from '../profiles.js';

export function applyCommand(program) {
  program
    .command('apply [profile]')
    .description('将 profile 的配置应用到默认目录（~/.claude 或 ~/.codex）')
    .action(async (profile) => {
      const allProfiles = getAllProfiles();

      if (allProfiles.length === 0) {
        console.log(chalk.yellow('没有可用的 profiles'));
        console.log(chalk.gray('使用 "ccc new" 创建配置'));
        process.exit(0);
      }

      let profileInfo;

      if (!profile) {
        const choices = allProfiles.map(p => {
          const typeTag = p.type === 'codex' ? chalk.blue('[Codex]') : chalk.magenta('[Claude]');
          return { name: `${typeTag} ${p.name}`, value: p };
        });

        const { selected } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selected',
            message: '选择要应用的配置:',
            choices
          }
        ]);
        profileInfo = selected;
      } else {
        profileInfo = resolveAnyProfile(profile);
        if (!profileInfo) {
          console.log(chalk.red(`Profile "${profile}" 不存在`));
          process.exit(1);
        }
      }

      const typeLabel = profileInfo.type === 'codex' ? 'Codex' : 'Claude';
      const targetDir = profileInfo.type === 'codex' ? '~/.codex/' : '~/.claude/settings.json';

      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `将 ${typeLabel} 配置 "${profileInfo.name}" 应用到 ${targetDir}？（会覆盖当前配置）`,
          default: false
        }
      ]);

      if (!confirm) {
        console.log(chalk.yellow('已取消'));
        process.exit(0);
      }

      let result;
      if (profileInfo.type === 'codex') {
        result = applyCodexProfile(profileInfo.name);
      } else {
        result = applyClaudeProfile(profileInfo.name);
      }

      if (result) {
        console.log(chalk.green(`\n✓ ${typeLabel} 配置 "${profileInfo.name}" 已应用到 ${targetDir}`));
      } else {
        console.log(chalk.red(`\n✗ 应用失败`));
        process.exit(1);
      }
    });
}
