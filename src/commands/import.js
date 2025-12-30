import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import readline from 'readline';
import Table from 'cli-table3';
import {
  ensureDirs,
  getProfiles,
  getProfilePath,
  setDefaultProfile,
  profileExists,
  createProfileFromTemplate
} from '../profiles.js';
import { parseCCSwitchSQL, parseAllApiHubJSON, detectFileFormat } from '../parsers.js';
import { extractFromText, getDomainName, sanitizeProfileName } from '../utils.js';

// 生成唯一的 profile 名称（如果重复则加后缀 token2, token3...）
function getUniqueProfileName(baseName, usedNames) {
  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return baseName;
  }

  let suffix = 2;
  let newName = `${baseName}-token${suffix}`;
  while (usedNames.has(newName)) {
    suffix++;
    newName = `${baseName}-token${suffix}`;
  }
  usedNames.add(newName);
  return newName;
}

// 交互式导入命令
export function importCommand(program) {
  // ccc import <file> - 从文件导入（自动识别格式）
  program
    .command('import <file>')
    .aliases(['if'])
    .description('从文件导入配置（自动识别 CC-Switch SQL 或 All API Hub JSON）')
    .action(async (file) => {
      // 检查文件是否存在
      const filePath = path.resolve(file);
      if (!fs.existsSync(filePath)) {
        console.log(chalk.red(`文件不存在: ${filePath}`));
        process.exit(1);
      }

      console.log(chalk.cyan(`读取文件: ${filePath}\n`));
      const content = fs.readFileSync(filePath, 'utf-8');

      // 自动检测格式
      const format = detectFileFormat(content);

      if (!format) {
        console.log(chalk.red('无法识别文件格式'));
        console.log(chalk.gray('支持的格式:'));
        console.log(chalk.gray('  - CC-Switch SQL 导出文件 (.sql)'));
        console.log(chalk.gray('  - All API Hub JSON 导出文件 (.json)'));
        process.exit(1);
      }

      let providers = [];
      let formatName = '';

      if (format === 'ccswitch') {
        formatName = 'CC-Switch SQL';
        providers = parseCCSwitchSQL(content);
      } else if (format === 'allapihub') {
        formatName = 'All API Hub JSON';
        providers = parseAllApiHubJSON(content);
      }

      if (providers.length === 0) {
        console.log(chalk.yellow('未找到有效的配置'));
        process.exit(0);
      }

      console.log(chalk.green(`✓ 识别到 ${formatName} 格式`));
      console.log(chalk.green(`✓ 找到 ${providers.length} 个配置\n`));

      // 显示找到的配置
      const table = new Table({
        head: [chalk.cyan('#'), chalk.cyan('Profile 名称'), chalk.cyan('API URL'), chalk.cyan('备注')],
        style: { head: [], border: [] }
      });

      // 用于跟踪已使用的名称（预览阶段）
      const previewUsedNames = new Set();

      providers.forEach((p, i) => {
        const url = p.settingsConfig?.env?.ANTHROPIC_BASE_URL || p.websiteUrl || '(未设置)';
        // 使用 API URL 生成 profile 名称，重复时加后缀
        const baseName = sanitizeProfileName(getDomainName(url) || p.name);
        const profileName = getUniqueProfileName(baseName, previewUsedNames);
        let note = '';

        if (format === 'ccswitch') {
          note = p.settingsConfig?.model || '(默认模型)';
        } else if (format === 'allapihub') {
          note = p.meta?.health === 'healthy' ? chalk.green('健康') :
                 p.meta?.health === 'warning' ? chalk.yellow('警告') :
                 p.meta?.health === 'error' ? chalk.red('错误') : chalk.gray('未知');
        }

        table.push([i + 1, profileName, url, note]);
      });

      console.log(table.toString());
      console.log();

      // All API Hub 特殊警告
      if (format === 'allapihub') {
        console.log(chalk.yellow('⚠ 注意: All API Hub 的 access_token 格式可能需要手动调整'));
        console.log(chalk.gray('  导入后可使用 "ccc edit <profile>" 修改 API Key\n'));
      }

      // 确认导入
      const { confirmImport } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmImport',
          message: `确定要导入这 ${providers.length} 个配置吗?`,
          default: true
        }
      ]);

      if (!confirmImport) {
        console.log(chalk.yellow('已取消'));
        process.exit(0);
      }

      // 选择要导入的配置
      // 重新计算名称用于选择列表
      const selectionUsedNames = new Set();
      const { selection } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'selection',
          message: '选择要导入的配置 (空格选择，回车确认):',
          choices: providers.map((p, i) => {
            const url = p.settingsConfig?.env?.ANTHROPIC_BASE_URL || p.websiteUrl || '';
            // 使用 API URL 生成 profile 名称，重复时加后缀
            const baseName = sanitizeProfileName(getDomainName(url) || p.name);
            const profileName = getUniqueProfileName(baseName, selectionUsedNames);
            return {
              name: `${profileName} (${url})`,
              value: i,
              checked: format === 'allapihub' ? p.meta?.health === 'healthy' : true
            };
          })
        }
      ]);

      const selectedProviders = selection.map(i => providers[i]);

      if (selectedProviders.length === 0) {
        console.log(chalk.yellow('未选择任何配置'));
        process.exit(0);
      }

      // 导入选中的配置
      ensureDirs();
      let imported = 0;
      let skipped = 0;

      // 用于跟踪导入时已使用的名称（包括已存在的 profiles）
      const importUsedNames = new Set(getProfiles());

      for (const provider of selectedProviders) {
        const url = provider.settingsConfig?.env?.ANTHROPIC_BASE_URL || provider.websiteUrl || '';
        // 使用 API URL 生成 profile 名称，重复时加后缀
        const baseName = sanitizeProfileName(getDomainName(url) || provider.name);
        const profileName = getUniqueProfileName(baseName, importUsedNames);
        const profilePath = getProfilePath(profileName);

        // 检查是否已存在
        if (fs.existsSync(profilePath)) {
          const { overwrite } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'overwrite',
              message: `配置 "${profileName}" 已存在，是否覆盖?`,
              default: false
            }
          ]);

          if (!overwrite) {
            skipped++;
            continue;
          }
        }

        // 从 provider 中提取 API 凭证
        const config = provider.settingsConfig || {};
        const env = config.env || {};
        const apiKey = env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || config.apiKey || '';
        const apiUrl = env.ANTHROPIC_BASE_URL || config.apiUrl || provider.websiteUrl || '';

        // 使用主配置模板创建完整的 profile（确保有 env 对象）
        createProfileFromTemplate(profileName, apiUrl, apiKey);
        console.log(chalk.green(`✓ ${profileName}`));
        imported++;
      }

      console.log(chalk.green(`\n✓ 导入完成: ${imported} 个成功` + (skipped > 0 ? `, ${skipped} 个跳过` : '')));

      // 如果是第一次导入，设置默认
      const profiles = getProfiles();
      if (profiles.length === imported && imported > 0) {
        const { setDefault } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'setDefault',
            message: '是否设置第一个配置为默认?',
            default: true
          }
        ]);

        if (setDefault) {
          setDefaultProfile(profiles[0]);
          console.log(chalk.green(`✓ 已设置 "${profiles[0]}" 为默认配置`));
        }
      }
    });
}

// 交互式粘贴导入（原 importProfile 功能，可选添加）
export async function interactiveImport() {
  console.log(chalk.cyan('请粘贴包含 API URL 和 SK Token 的文本，然后按两次回车确认:'));
  console.log(chalk.gray('(支持自动识别 URL 和 sk-xxx 格式的 token)'));
  console.log();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  let inputText = '';
  let emptyLineCount = 0;

  const text = await new Promise((resolve) => {
    rl.on('line', (line) => {
      if (line === '') {
        emptyLineCount++;
        if (emptyLineCount >= 2) {
          rl.close();
          resolve(inputText);
        }
      } else {
        emptyLineCount = 0;
        inputText += line + '\n';
      }
    });
  });

  const { urls, tokens } = extractFromText(text);

  if (urls.length === 0 && tokens.length === 0) {
    console.log(chalk.red('未找到有效的 URL 或 Token'));
    process.exit(1);
  }

  console.log();
  console.log(chalk.green('识别到的内容:'));

  if (urls.length > 0) {
    console.log(chalk.cyan('URLs:'));
    urls.forEach(u => console.log(`  - ${u}`));
  }

  if (tokens.length > 0) {
    console.log(chalk.cyan('Tokens:'));
    tokens.forEach(t => console.log(`  - ${t.substring(0, 10)}...`));
  }

  // 使用第一个 URL 的域名作为默认名称
  let defaultName = 'custom';
  if (urls.length > 0) {
    const domainName = getDomainName(urls[0]);
    if (domainName) {
      defaultName = domainName;
    }
  }

  const { profileName, apiUrl, apiKey } = await inquirer.prompt([
    {
      type: 'input',
      name: 'profileName',
      message: 'Profile 名称:',
      default: defaultName
    },
    {
      type: 'list',
      name: 'apiUrl',
      message: '选择 API URL:',
      choices: urls.length > 0 ? urls : ['https://api.anthropic.com'],
      when: urls.length > 0
    },
    {
      type: 'input',
      name: 'apiUrl',
      message: 'API URL:',
      default: 'https://api.anthropic.com',
      when: urls.length === 0
    },
    {
      type: 'list',
      name: 'apiKey',
      message: '选择 API Key:',
      choices: tokens.map(t => ({ name: `${t.substring(0, 15)}...`, value: t })),
      when: tokens.length > 1
    },
    {
      type: 'input',
      name: 'apiKey',
      message: 'API Key:',
      default: tokens[0] || '',
      when: tokens.length <= 1
    }
  ]);

  const finalApiUrl = apiUrl || 'https://api.anthropic.com';
  const finalApiKey = apiKey || tokens[0] || '';

  ensureDirs();
  const profilePath = getProfilePath(profileName);

  if (fs.existsSync(profilePath)) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: `Profile "${profileName}" 已存在，是否覆盖?`,
        default: false
      }
    ]);

    if (!overwrite) {
      console.log(chalk.yellow('已取消'));
      process.exit(0);
    }
  }

  // 使用主配置模板创建完整的 profile（确保有 env 对象）
  createProfileFromTemplate(profileName, finalApiUrl, finalApiKey);
  console.log(chalk.green(`\n✓ Profile "${profileName}" 已保存到 ${profilePath}`));

  // 如果是第一个 profile，设为默认
  const profiles = getProfiles();
  if (profiles.length === 1) {
    setDefaultProfile(profileName);
    console.log(chalk.green(`✓ 已设为默认 profile`));
  }
}

