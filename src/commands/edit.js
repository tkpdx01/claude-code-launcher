import fs from 'fs';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { 
  getProfiles, 
  getDefaultProfile, 
  profileExists, 
  getProfilePath, 
  readProfile, 
  saveProfile, 
  setDefaultProfile,
  deleteProfile 
} from '../profiles.js';

export function editCommand(program) {
  program
    .command('edit [profile]')
    .description('编辑 profile 配置')
    .action(async (profile) => {
      const profiles = getProfiles();

      if (profiles.length === 0) {
        console.log(chalk.yellow('没有可用的 profiles'));
        console.log(chalk.gray('使用 "ccc import" 导入配置'));
        process.exit(0);
      }

      // 如果没有指定 profile，交互选择
      if (!profile) {
        const { selectedProfile } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedProfile',
            message: '选择要编辑的配置:',
            choices: profiles
          }
        ]);
        profile = selectedProfile;
      }

      if (!profileExists(profile)) {
        console.log(chalk.red(`Profile "${profile}" 不存在`));
        process.exit(1);
      }

      const currentSettings = readProfile(profile);

      console.log(chalk.cyan(`\n当前配置 (${profile}):`));
      console.log(chalk.gray(`  API URL: ${currentSettings.apiUrl || '未设置'}`));
      console.log(chalk.gray(`  API Key: ${currentSettings.apiKey ? currentSettings.apiKey.substring(0, 10) + '...' : '未设置'}`));
      console.log();

      const { apiUrl, apiKey, newName } = await inquirer.prompt([
        {
          type: 'input',
          name: 'apiUrl',
          message: 'API URL:',
          default: currentSettings.apiUrl || ''
        },
        {
          type: 'input',
          name: 'apiKey',
          message: 'API Key:',
          default: currentSettings.apiKey || ''
        },
        {
          type: 'input',
          name: 'newName',
          message: '重命名 (留空保持不变):',
          default: ''
        }
      ]);

      const newSettings = {
        ...currentSettings,
        apiUrl,
        apiKey
      };

      // 如果重命名
      if (newName && newName !== profile) {
        const newPath = getProfilePath(newName);
        if (fs.existsSync(newPath)) {
          console.log(chalk.red(`Profile "${newName}" 已存在`));
          process.exit(1);
        }
        saveProfile(newName, newSettings);
        deleteProfile(profile);

        // 更新默认 profile
        if (getDefaultProfile() === profile) {
          setDefaultProfile(newName);
        }

        console.log(chalk.green(`\n✓ Profile 已重命名为 "${newName}" 并保存`));
      } else {
        saveProfile(profile, newSettings);
        console.log(chalk.green(`\n✓ Profile "${profile}" 已更新`));
      }
    });
}

