import fs from 'fs';
import chalk from 'chalk';
import inquirer from 'inquirer';
import {
  getAllProfiles,
  getDefaultProfile,
  profileExists,
  codexProfileExists,
  anyProfileExists,
  getProfilePath,
  readProfile,
  saveProfile,
  setDefaultProfile,
  deleteProfile,
  resolveAnyProfile,
  getProfileCredentials,
  getCodexProfileCredentials,
  getClaudeSettingsTemplate,
  ensureRequiredClaudeEnvSettings,
  ensureClaudeSettingsExtras,
  applyClaudeSettingsExtras,
  createCodexProfile,
  deleteCodexProfile
} from '../profiles.js';

export function editCommand(program) {
  program
    .command('edit [profile]')
    .description('编辑 profile 配置')
    .action(async (profile) => {
      const allProfiles = getAllProfiles();

      if (allProfiles.length === 0) {
        console.log(chalk.yellow('没有可用的 profiles'));
        console.log(chalk.gray('使用 "ccc new" 创建配置'));
        process.exit(0);
      }

      let profileInfo;

      // 如果没有指定 profile，交互选择
      if (!profile) {
        const choices = allProfiles.map(p => {
          const typeTag = p.type === 'codex' ? chalk.blue('[Codex]') : chalk.magenta('[Claude]');
          return { name: `${typeTag} ${p.name}`, value: p };
        });

        const { selected } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selected',
            message: '选择要编辑的配置:',
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

      if (profileInfo.type === 'codex') {
        // 编辑 Codex profile
        const { apiKey: currentApiKey, baseUrl: currentBaseUrl, model: currentModel } = getCodexProfileCredentials(profileInfo.name);

        console.log(chalk.cyan(`\n当前配置 (${profileInfo.name}) ${chalk.blue('[Codex]')}:`));
        console.log(chalk.gray(`  OPENAI_API_KEY: ${currentApiKey ? currentApiKey.substring(0, 10) + '...' : '未设置'}`));
        console.log(chalk.gray(`  Base URL: ${currentBaseUrl || '未设置'}`));
        console.log(chalk.gray(`  Model: ${currentModel || '(默认)'}`));
        console.log();

        const { apiKey, baseUrl, model, newName } = await inquirer.prompt([
          {
            type: 'input',
            name: 'apiKey',
            message: 'OPENAI_API_KEY:',
            default: currentApiKey || ''
          },
          {
            type: 'input',
            name: 'baseUrl',
            message: 'Base URL:',
            default: currentBaseUrl || 'https://api.openai.com/v1'
          },
          {
            type: 'input',
            name: 'model',
            message: 'Model (留空使用默认):',
            default: currentModel || ''
          },
          {
            type: 'input',
            name: 'newName',
            message: 'Profile 名称:',
            default: profileInfo.name
          }
        ]);

        if (newName && newName !== profileInfo.name) {
          const check = anyProfileExists(newName);
          if (check.exists) {
            console.log(chalk.red(`Profile "${newName}" 已存在`));
            process.exit(1);
          }
          createCodexProfile(newName, apiKey, baseUrl, model);
          deleteCodexProfile(profileInfo.name);

          if (getDefaultProfile() === profileInfo.name) {
            setDefaultProfile(newName);
          }
          console.log(chalk.green(`\n✓ Codex Profile 已重命名为 "${newName}" 并保存`));
        } else {
          createCodexProfile(profileInfo.name, apiKey, baseUrl, model);
          console.log(chalk.green(`\n✓ Codex Profile "${profileInfo.name}" 已更新`));
        }
      } else {
        // 编辑 Claude profile（保持原逻辑）
        const { apiKey: currentApiKey, apiUrl: currentApiUrl } = getProfileCredentials(profileInfo.name);

        console.log(chalk.cyan(`\n当前配置 (${profileInfo.name}) ${chalk.magenta('[Claude]')}:`));
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
            default: profileInfo.name
          }
        ]);

        let currentProfile = readProfile(profileInfo.name);
        if (!currentProfile || !currentProfile.env) {
          const template = getClaudeSettingsTemplate() || {};
          currentProfile = { ...template };
        }

        if (!currentProfile.env) {
          currentProfile.env = {};
        }

        currentProfile.env.ANTHROPIC_AUTH_TOKEN = apiKey;
        currentProfile.env.ANTHROPIC_BASE_URL = apiUrl;

        ensureRequiredClaudeEnvSettings();
        ensureClaudeSettingsExtras();
        currentProfile.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
        currentProfile.env.CLAUDE_CODE_ATTRIBUTION_HEADER = '0';
        currentProfile.env.DISABLE_INSTALLATION_CHECKS = '1';
        applyClaudeSettingsExtras(currentProfile);

        if (newName && newName !== profileInfo.name) {
          const newPath = getProfilePath(newName);
          if (fs.existsSync(newPath)) {
            console.log(chalk.red(`Profile "${newName}" 已存在`));
            process.exit(1);
          }
          saveProfile(newName, currentProfile);
          deleteProfile(profileInfo.name);

          if (getDefaultProfile() === profileInfo.name) {
            setDefaultProfile(newName);
          }

          console.log(chalk.green(`\n✓ Claude Profile 已重命名为 "${newName}" 并保存`));
        } else {
          saveProfile(profileInfo.name, currentProfile);
          console.log(chalk.green(`\n✓ Claude Profile "${profileInfo.name}" 已更新`));
        }
      }
    });
}
