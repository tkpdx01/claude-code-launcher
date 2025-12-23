import chalk from 'chalk';
import inquirer from 'inquirer';
import {
  ensureDirs,
  getProfiles,
  profileExists,
  saveProfile,
  setDefaultProfile
} from '../profiles.js';
import { launchClaude } from '../launch.js';

export function newCommand(program) {
  program
    .command('new [name]')
    .description('创建新的影子配置（只包含 API 凭证）')
    .action(async (name) => {
      // 如果没有提供名称，询问
      if (!name) {
        const { profileName } = await inquirer.prompt([
          {
            type: 'input',
            name: 'profileName',
            message: '配置名称:',
            validate: (input) => input.trim() ? true : '请输入配置名称'
          }
        ]);
        name = profileName;
      }

      // 检查是否已存在
      if (profileExists(name)) {
        const { overwrite } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: `配置 "${name}" 已存在，是否覆盖?`,
            default: false
          }
        ]);
        if (!overwrite) {
          console.log(chalk.yellow('已取消'));
          process.exit(0);
        }
      }

      const { apiUrl, apiKey, finalName } = await inquirer.prompt([
        {
          type: 'input',
          name: 'apiUrl',
          message: 'ANTHROPIC_BASE_URL:',
          default: 'https://api.anthropic.com'
        },
        {
          type: 'input',
          name: 'apiKey',
          message: 'ANTHROPIC_AUTH_TOKEN:',
          default: ''
        },
        {
          type: 'input',
          name: 'finalName',
          message: 'Profile 名称:',
          default: name
        }
      ]);

      // 如果名称改变了，检查新名称是否存在
      if (finalName !== name && profileExists(finalName)) {
        const { overwriteNew } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwriteNew',
            message: `配置 "${finalName}" 已存在，是否覆盖?`,
            default: false
          }
        ]);
        if (!overwriteNew) {
          console.log(chalk.yellow('已取消'));
          process.exit(0);
        }
      }

      // 影子配置只存储 API 凭证
      const newSettings = {
        ANTHROPIC_AUTH_TOKEN: apiKey,
        ANTHROPIC_BASE_URL: apiUrl
      };

      ensureDirs();
      saveProfile(finalName, newSettings);
      console.log(chalk.green(`\n✓ 配置 "${finalName}" 已创建`));

      // 如果是第一个 profile，设为默认
      const profiles = getProfiles();
      if (profiles.length === 1) {
        setDefaultProfile(finalName);
        console.log(chalk.green(`✓ 已设为默认配置`));
      }

      // 询问是否立即使用
      const { useNow } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'useNow',
          message: '是否立即启动 Claude?',
          default: false
        }
      ]);

      if (useNow) {
        launchClaude(finalName);
      }
    });
}

