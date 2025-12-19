import chalk from 'chalk';
import inquirer from 'inquirer';
import { 
  ensureDirs, 
  getProfiles, 
  profileExists, 
  saveProfile, 
  setDefaultProfile, 
  getClaudeSettingsTemplate 
} from '../profiles.js';
import { launchClaude } from '../launch.js';

export function newCommand(program) {
  program
    .command('new [name]')
    .description('基于 ~/.claude/settings.json 模板创建新配置')
    .action(async (name) => {
      const template = getClaudeSettingsTemplate();

      // 显示模板状态
      if (template) {
        console.log(chalk.green('✓ 检测到模板文件: ~/.claude/settings.json'));
        console.log(chalk.gray('  将基于此模板创建新配置\n'));
      } else {
        console.log(chalk.yellow('! 未找到模板文件: ~/.claude/settings.json'));
        console.log(chalk.gray('  将创建空白配置\n'));
      }

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

      // 基于模板创建，但需要用户填写 API 信息
      const baseSettings = template || {};

      // 显示模板中已有的设置（如果有）
      if (template) {
        console.log(chalk.cyan('模板中的现有设置:'));
        if (template.apiUrl) console.log(chalk.gray(`  API URL: ${template.apiUrl}`));
        if (template.apiKey) console.log(chalk.gray(`  API Key: ${template.apiKey.substring(0, 10)}...`));
        const otherKeys = Object.keys(template).filter(k => !['apiUrl', 'apiKey'].includes(k));
        if (otherKeys.length > 0) {
          console.log(chalk.gray(`  其他设置: ${otherKeys.join(', ')}`));
        }
        console.log();
      }

      const { apiUrl, apiKey } = await inquirer.prompt([
        {
          type: 'input',
          name: 'apiUrl',
          message: 'API URL:',
          default: baseSettings.apiUrl || 'https://api.anthropic.com'
        },
        {
          type: 'input',
          name: 'apiKey',
          message: 'API Key:',
          default: baseSettings.apiKey || ''
        }
      ]);

      // 合并设置：保留模板中的其他设置，覆盖 API 相关设置
      const newSettings = {
        ...baseSettings,
        apiUrl,
        apiKey
      };

      ensureDirs();
      saveProfile(name, newSettings);
      console.log(chalk.green(`\n✓ 配置 "${name}" 已创建`));

      // 如果是第一个 profile，设为默认
      const profiles = getProfiles();
      if (profiles.length === 1) {
        setDefaultProfile(name);
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
        launchClaude(name);
      }
    });
}

