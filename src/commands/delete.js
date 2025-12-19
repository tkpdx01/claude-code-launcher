import chalk from 'chalk';
import inquirer from 'inquirer';
import { 
  getProfiles, 
  getDefaultProfile, 
  profileExists, 
  deleteProfile, 
  clearDefaultProfile 
} from '../profiles.js';

export function deleteCommand(program) {
  program
    .command('delete [profile]')
    .alias('rm')
    .description('删除 profile')
    .action(async (profile) => {
      const profiles = getProfiles();

      if (profiles.length === 0) {
        console.log(chalk.yellow('没有可用的 profiles'));
        process.exit(0);
      }

      // 如果没有指定 profile，交互选择
      if (!profile) {
        const { selectedProfile } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedProfile',
            message: '选择要删除的配置:',
            choices: profiles
          }
        ]);
        profile = selectedProfile;
      }

      if (!profileExists(profile)) {
        console.log(chalk.red(`Profile "${profile}" 不存在`));
        process.exit(1);
      }

      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `确定要删除 "${profile}" 吗?`,
          default: false
        }
      ]);

      if (!confirm) {
        console.log(chalk.yellow('已取消'));
        process.exit(0);
      }

      deleteProfile(profile);

      // 如果删除的是默认 profile，清除默认设置
      if (getDefaultProfile() === profile) {
        clearDefaultProfile();
      }

      console.log(chalk.green(`✓ Profile "${profile}" 已删除`));
    });
}

