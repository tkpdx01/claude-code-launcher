import chalk from 'chalk';
import inquirer from 'inquirer';
import {
  ensureDirs,
  getProfiles,
  getAllProfiles,
  profileExists,
  codexProfileExists,
  anyProfileExists,
  createProfileFromTemplate,
  createCodexProfile,
  setDefaultProfile,
  ensureClaudeSettingsExtras
} from '../profiles.js';
import { launchClaude, launchCodex } from '../launch.js';

const RESERVED_PROFILE_NAMES = [
  'list',
  'ls',
  'use',
  'show',
  'import',
  'if',
  'new',
  'edit',
  'delete',
  'rm',
  'sync',
  'apply',
  'webdav',
  'help'
];

function isReservedProfileName(name) {
  return RESERVED_PROFILE_NAMES.includes(name);
}

function validateProfileName(input) {
  const trimmed = input.trim();
  if (!trimmed) {
    return '请输入配置名称';
  }
  if (isReservedProfileName(trimmed)) {
    return '配置名称不能使用命令关键词';
  }
  return true;
}

export function newCommand(program) {
  program
    .command('new [name]')
    .description('创建新的配置（Claude 或 Codex）')
    .action(async (name) => {
      // 选择 profile 类型
      const { profileType } = await inquirer.prompt([
        {
          type: 'list',
          name: 'profileType',
          message: '配置类型:',
          choices: [
            { name: `${chalk.magenta('[Claude]')} Claude Code`, value: 'claude' },
            { name: `${chalk.blue('[Codex]')}  OpenAI Codex`, value: 'codex' }
          ]
        }
      ]);

      // 如果没有提供名称，询问
      if (!name) {
        const { profileName } = await inquirer.prompt([
          {
            type: 'input',
            name: 'profileName',
            message: '配置名称:',
            validate: validateProfileName
          }
        ]);
        name = profileName;
      } else {
        const validationResult = validateProfileName(name);
        if (validationResult !== true) {
          console.log(chalk.red(validationResult));
          process.exit(1);
        }
      }

      // 检查是否已存在（跨类型检查）
      const existing = anyProfileExists(name);
      if (existing.exists) {
        const existingType = existing.type === 'codex' ? 'Codex' : 'Claude';
        const { overwrite } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: `配置 "${name}" 已存在（${existingType} 类型），是否覆盖?`,
            default: false
          }
        ]);
        if (!overwrite) {
          console.log(chalk.yellow('已取消'));
          process.exit(0);
        }
      }

      if (profileType === 'codex') {
        // Codex profile 创建
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'apiKey',
            message: 'OPENAI_API_KEY:',
            default: ''
          },
          {
            type: 'input',
            name: 'baseUrl',
            message: 'Base URL:',
            default: 'https://api.openai.com/v1'
          },
          {
            type: 'input',
            name: 'model',
            message: 'Model (留空使用默认):',
            default: ''
          },
          {
            type: 'input',
            name: 'finalName',
            message: 'Profile 名称:',
            default: name,
            validate: validateProfileName
          }
        ]);

        const finalName = answers.finalName;
        if (finalName !== name) {
          const check = anyProfileExists(finalName);
          if (check.exists) {
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
        }

        ensureDirs();
        createCodexProfile(finalName, answers.apiKey, answers.baseUrl, answers.model);
        console.log(chalk.green(`\n✓ Codex 配置 "${finalName}" 已创建`));

        const allProfiles = getAllProfiles();
        if (allProfiles.length === 1) {
          setDefaultProfile(finalName);
          console.log(chalk.green(`✓ 已设为默认配置`));
        }

        const { useNow } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'useNow',
            message: '是否立即启动 Codex?',
            default: false
          }
        ]);
        if (useNow) {
          launchCodex(finalName);
        }
      } else {
        // Claude profile 创建（保持原逻辑）
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
            default: name,
            validate: validateProfileName
          }
        ]);

        if (finalName !== name) {
          const check = anyProfileExists(finalName);
          if (check.exists) {
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
        }

        ensureDirs();
        ensureClaudeSettingsExtras();
        createProfileFromTemplate(finalName, apiUrl, apiKey);
        console.log(chalk.green(`\n✓ Claude 配置 "${finalName}" 已创建（基于 ~/.claude/settings.json）`));

        const allProfiles = getAllProfiles();
        if (allProfiles.length === 1) {
          setDefaultProfile(finalName);
          console.log(chalk.green(`✓ 已设为默认配置`));
        }

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
      }
    });
}
