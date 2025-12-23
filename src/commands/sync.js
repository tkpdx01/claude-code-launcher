import chalk from 'chalk';
import inquirer from 'inquirer';
import {
  getProfiles,
  syncProfileWithTemplate,
  getClaudeSettingsTemplate,
  resolveProfile
} from '../profiles.js';

export function syncCommand(program) {
  program
    .command('sync [profile]')
    .description('同步 ~/.claude/settings.json 到 profile（保留 API 凭证）')
    .option('-a, --all', '同步所有 profiles')
    .action(async (profile, options) => {
      // 检查主配置是否存在
      const template = getClaudeSettingsTemplate();
      if (!template) {
        console.log(chalk.red('未找到 ~/.claude/settings.json'));
        console.log(chalk.gray('请确保 Claude Code 已正确安装'));
        process.exit(1);
      }

      const profiles = getProfiles();

      if (profiles.length === 0) {
        console.log(chalk.yellow('没有可用的 profiles'));
        console.log(chalk.gray('使用 "ccc new" 创建配置'));
        process.exit(0);
      }

      // 同步所有 profiles
      if (options.all) {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: `确定要同步所有 ${profiles.length} 个 profiles 吗?`,
            default: false
          }
        ]);

        if (!confirm) {
          console.log(chalk.yellow('已取消'));
          process.exit(0);
        }

        console.log(chalk.cyan('\n开始同步所有 profiles...\n'));

        let successCount = 0;
        for (const p of profiles) {
          const result = syncProfileWithTemplate(p);
          if (result) {
            console.log(chalk.green(`  ✓ ${p}`));
            successCount++;
          } else {
            console.log(chalk.red(`  ✗ ${p} (同步失败)`));
          }
        }

        console.log(chalk.green(`\n✓ 已同步 ${successCount}/${profiles.length} 个 profiles`));
        return;
      }

      // 同步单个 profile
      if (!profile) {
        const { selectedProfile } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedProfile',
            message: '选择要同步的配置:',
            choices: profiles
          }
        ]);
        profile = selectedProfile;
      } else {
        const resolved = resolveProfile(profile);
        if (!resolved) {
          console.log(chalk.red(`Profile "${profile}" 不存在`));
          process.exit(1);
        }
        profile = resolved;
      }

      const result = syncProfileWithTemplate(profile);
      if (result) {
        console.log(chalk.green(`\n✓ Profile "${profile}" 已同步（保留了 API 凭证）`));
      } else {
        console.log(chalk.red(`\n✗ 同步失败`));
        process.exit(1);
      }
    });
}
