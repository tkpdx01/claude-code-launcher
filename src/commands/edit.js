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
  deleteProfile,
  resolveProfile,
  getProfileCredentials,
  getClaudeSettingsTemplate
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
      } else {
        // 支持序号或名称
        const resolved = resolveProfile(profile);
        if (!resolved) {
          console.log(chalk.red(`Profile "${profile}" 不存在`));
          process.exit(1);
        }
        profile = resolved;
      }

      // 使用新的 getProfileCredentials 函数获取凭证（支持新旧格式）
      const { apiKey: currentApiKey, apiUrl: currentApiUrl } = getProfileCredentials(profile);

      console.log(chalk.cyan(`\n当前配置 (${profile}):`));
      console.log(chalk.gray(`  ANTHROPIC_BASE_URL: ${currentApiUrl || '未设置'}`));
      console.log(chalk.gray(`  ANTHROPIC_AUTH_TOKEN: ${currentApiKey ? currentApiKey.substring(0, 10) + '...' : '未设置'}`));
      console.log();

      const { apiUrl, apiKey, newName } = await inquirer.prompt([
        {
          type: 'input',
          name: 'apiUrl',
          message: 'ANTHROPIC_BASE_URL:',
          default: currentApiUrl || ''
        },
        {
          type: 'input',
          name: 'apiKey',
          message: 'ANTHROPIC_AUTH_TOKEN:',
          default: currentApiKey || ''
        },
        {
          type: 'input',
          name: 'newName',
          message: 'Profile 名称:',
          default: profile
        }
      ]);

      // 读取当前 profile 或使用主配置模板
      let currentProfile = readProfile(profile);
      if (!currentProfile || !currentProfile.env) {
        // 如果是旧格式或空配置，基于主配置模板创建
        const template = getClaudeSettingsTemplate() || {};
        currentProfile = { ...template };
      }

      // 确保 env 对象存在
      if (!currentProfile.env) {
        currentProfile.env = {};
      }

      // 更新 env 中的 API 凭证
      currentProfile.env.ANTHROPIC_AUTH_TOKEN = apiKey;
      currentProfile.env.ANTHROPIC_BASE_URL = apiUrl;

      // 如果重命名
      if (newName && newName !== profile) {
        const newPath = getProfilePath(newName);
        if (fs.existsSync(newPath)) {
          console.log(chalk.red(`Profile "${newName}" 已存在`));
          process.exit(1);
        }
        saveProfile(newName, currentProfile);
        deleteProfile(profile);

        // 更新默认 profile
        if (getDefaultProfile() === profile) {
          setDefaultProfile(newName);
        }

        console.log(chalk.green(`\n✓ Profile 已重命名为 "${newName}" 并保存`));
      } else {
        saveProfile(profile, currentProfile);
        console.log(chalk.green(`\n✓ Profile "${profile}" 已更新`));
      }
    });
}

