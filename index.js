#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import readline from 'readline';

const program = new Command();

// 配置文件存储目录
const CONFIG_DIR = path.join(os.homedir(), '.ccc');
const PROFILES_DIR = path.join(CONFIG_DIR, 'profiles');
const DEFAULT_FILE = path.join(CONFIG_DIR, 'default');
const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

// 确保目录存在
function ensureDirs() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!fs.existsSync(PROFILES_DIR)) {
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
  }
}

// 获取所有 profiles
function getProfiles() {
  ensureDirs();
  const files = fs.readdirSync(PROFILES_DIR);
  return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
}

// 获取默认 profile
function getDefaultProfile() {
  if (fs.existsSync(DEFAULT_FILE)) {
    return fs.readFileSync(DEFAULT_FILE, 'utf-8').trim();
  }
  return null;
}

// 设置默认 profile
function setDefaultProfile(name) {
  ensureDirs();
  fs.writeFileSync(DEFAULT_FILE, name);
}

// 获取 profile 路径
function getProfilePath(name) {
  return path.join(PROFILES_DIR, `${name}.json`);
}

// 检查 profile 是否存在
function profileExists(name) {
  return fs.existsSync(getProfilePath(name));
}

// 获取 Claude 默认 settings 模板
function getClaudeSettingsTemplate() {
  if (fs.existsSync(CLAUDE_SETTINGS_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    } catch {
      return null;
    }
  }
  return null;
}

// 显示帮助信息
function showHelp() {
  console.log(chalk.cyan.bold('\n  CCC - Claude Code Settings Launcher\n'));
  console.log(chalk.white('  管理多个 Claude Code 配置文件，快速切换不同的 API 设置\n'));

  console.log(chalk.yellow('  启动命令:'));
  console.log(chalk.gray('    ccc                    ') + '使用默认配置启动，无默认则交互选择');
  console.log(chalk.gray('    ccc <profile>          ') + '使用指定配置启动 Claude');
  console.log(chalk.gray('    ccc -d, --ddd          ') + '启动时添加 --dangerously-skip-permissions');
  console.log();

  console.log(chalk.yellow('  管理命令:'));
  console.log(chalk.gray('    ccc list, ls           ') + '列出所有配置');
  console.log(chalk.gray('    ccc use <profile>      ') + '设置默认配置');
  console.log(chalk.gray('    ccc new [name]         ') + '基于模板创建新配置');
  console.log(chalk.gray('    ccc import             ') + '从粘贴文本导入（自动识别 URL/Token）');
  console.log(chalk.gray('    ccc sync [profile]     ') + '同步模板设置（保留 API 配置）');
  console.log(chalk.gray('    ccc sync -a, --all     ') + '同步所有配置');
  console.log(chalk.gray('    ccc edit [profile]     ') + '编辑配置');
  console.log(chalk.gray('    ccc delete, rm [name]  ') + '删除配置');
  console.log(chalk.gray('    ccc help               ') + '显示此帮助信息');
  console.log();

  console.log(chalk.yellow('  配置存储:'));
  console.log(chalk.gray('    ~/.ccc/profiles/       ') + '配置文件目录');
  console.log(chalk.gray('    ~/.claude/settings.json') + '模板来源（用于 ccc new）');
  console.log();

  console.log(chalk.yellow('  示例:'));
  console.log(chalk.gray('    ccc new kfc            ') + '基于模板创建名为 kfc 的配置');
  console.log(chalk.gray('    ccc kfc                ') + '使用 kfc 配置启动');
  console.log(chalk.gray('    ccc kfc -d             ') + '使用 kfc 配置 + 跳过权限确认启动');
  console.log(chalk.gray('    ccc use kfc            ') + '将 kfc 设为默认');
  console.log();
}

// 启动 claude
function launchClaude(profileName, dangerouslySkipPermissions = false) {
  const profilePath = getProfilePath(profileName);

  if (!fs.existsSync(profilePath)) {
    console.log(chalk.red(`Profile "${profileName}" 不存在`));
    console.log(chalk.yellow(`使用 "ccc list" 查看可用的 profiles`));
    process.exit(1);
  }

  const args = ['--settings', profilePath];
  if (dangerouslySkipPermissions) {
    args.push('--dangerously-skip-permissions');
  }

  console.log(chalk.green(`启动 Claude Code，使用配置: ${profileName}`));
  console.log(chalk.gray(`命令: claude ${args.join(' ')}`));

  const child = spawn('claude', args, {
    stdio: 'inherit',
    shell: true
  });

  child.on('error', (err) => {
    console.log(chalk.red(`启动失败: ${err.message}`));
    process.exit(1);
  });
}

// 从文本中提取 URL 和 token
function extractFromText(text) {
  // 提取 URL
  const urlRegex = /https?:\/\/[^\s"'<>]+/gi;
  const urls = text.match(urlRegex) || [];

  // 提取 sk token
  const tokenRegex = /sk-[a-zA-Z0-9_-]+/g;
  const tokens = text.match(tokenRegex) || [];

  return { urls, tokens };
}

// 从 URL 获取域名作为名称
function getDomainName(url) {
  try {
    const urlObj = new URL(url);
    // 获取完整域名（包括子域名）
    let hostname = urlObj.hostname;
    // 移除 www. 前缀
    hostname = hostname.replace(/^www\./, '');
    // 将点替换为下划线，使其成为有效的文件名
    return hostname.replace(/\./g, '_');
  } catch {
    return null;
  }
}

// 交互式选择 profile
async function selectProfile(dangerouslySkipPermissions = false) {
  const profiles = getProfiles();

  if (profiles.length === 0) {
    console.log(chalk.yellow('没有可用的 profiles'));
    console.log(chalk.gray('使用 "ccc import" 导入配置'));
    process.exit(0);
  }

  const defaultProfile = getDefaultProfile();

  const choices = profiles.map(p => ({
    name: p === defaultProfile ? `${p} ${chalk.green('(默认)')}` : p,
    value: p
  }));

  const { profile } = await inquirer.prompt([
    {
      type: 'list',
      name: 'profile',
      message: '选择要使用的配置:',
      choices,
      default: defaultProfile
    }
  ]);

  launchClaude(profile, dangerouslySkipPermissions);
}

// import 命令
async function importProfile() {
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

  // 创建 settings.json
  const settings = {
    apiUrl: finalApiUrl,
    apiKey: finalApiKey
  };

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

  fs.writeFileSync(profilePath, JSON.stringify(settings, null, 2));
  console.log(chalk.green(`\n✓ Profile "${profileName}" 已保存到 ${profilePath}`));

  // 如果是第一个 profile，设为默认
  const profiles = getProfiles();
  if (profiles.length === 1) {
    setDefaultProfile(profileName);
    console.log(chalk.green(`✓ 已设为默认 profile`));
  }
}

// 主程序
program
  .name('ccc')
  .description('Claude Code Settings Launcher - 管理多个 Claude Code 配置文件')
  .version('1.0.0');

// ccc list
program
  .command('list')
  .alias('ls')
  .description('列出所有 profiles')
  .action(() => {
    const profiles = getProfiles();
    const defaultProfile = getDefaultProfile();

    if (profiles.length === 0) {
      console.log(chalk.yellow('没有可用的 profiles'));
      console.log(chalk.gray('使用 "ccc import" 导入配置'));
      return;
    }

    console.log(chalk.cyan('可用的 Profiles:\n'));
    profiles.forEach(p => {
      const isDefault = p === defaultProfile;
      const marker = isDefault ? chalk.green(' (默认)') : '';
      console.log(`  ${chalk.white(p)}${marker}`);
    });
  });

// ccc use <profile>
program
  .command('use <profile>')
  .description('设置默认 profile')
  .action((profile) => {
    if (!profileExists(profile)) {
      console.log(chalk.red(`Profile "${profile}" 不存在`));
      console.log(chalk.yellow(`使用 "ccc list" 查看可用的 profiles`));
      process.exit(1);
    }

    setDefaultProfile(profile);
    console.log(chalk.green(`✓ 默认 profile 已设置为 "${profile}"`));
  });

// ccc import
program
  .command('import')
  .description('从粘贴的文本中导入配置（自动识别 URL 和 Token）')
  .action(importProfile);

// ccc new [name] - 基于模板创建新配置
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
    fs.writeFileSync(getProfilePath(name), JSON.stringify(newSettings, null, 2));
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

// ccc help
program
  .command('help')
  .description('显示帮助信息')
  .action(showHelp);

// ccc sync [profile] - 同步模板设置到已有配置
program
  .command('sync [profile]')
  .description('从 ~/.claude/settings.json 同步设置（保留 API 配置）')
  .option('-a, --all', '同步所有配置')
  .action(async (profile, options) => {
    const template = getClaudeSettingsTemplate();

    if (!template) {
      console.log(chalk.red('✗ 未找到模板文件: ~/.claude/settings.json'));
      console.log(chalk.gray('  请确保该文件存在'));
      process.exit(1);
    }

    const profiles = getProfiles();
    if (profiles.length === 0) {
      console.log(chalk.yellow('没有可用的配置'));
      process.exit(0);
    }

    // 需要保留的字段
    const preserveKeys = ['apiUrl', 'apiKey', 'includeCoAuthoredBy'];

    // 同步单个配置的函数
    const syncProfile = (name) => {
      const profilePath = getProfilePath(name);
      const currentSettings = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));

      // 保留指定字段
      const preserved = {};
      preserveKeys.forEach(key => {
        if (currentSettings[key] !== undefined) {
          preserved[key] = currentSettings[key];
        }
      });

      // 确保 includeCoAuthoredBy 为 false
      if (preserved.includeCoAuthoredBy === undefined) {
        preserved.includeCoAuthoredBy = false;
      }

      // 合并：模板 + 保留的字段
      const newSettings = {
        ...template,
        ...preserved
      };

      fs.writeFileSync(profilePath, JSON.stringify(newSettings, null, 2));
      return { name, preserved };
    };

    if (options.all) {
      // 同步所有配置
      console.log(chalk.cyan(`同步所有配置 (${profiles.length} 个)...\n`));

      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `确定要同步所有 ${profiles.length} 个配置吗?`,
          default: false
        }
      ]);

      if (!confirm) {
        console.log(chalk.yellow('已取消'));
        process.exit(0);
      }

      profiles.forEach(name => {
        const result = syncProfile(name);
        console.log(chalk.green(`✓ ${name}`) + chalk.gray(` (保留: ${Object.keys(result.preserved).join(', ')})`));
      });

      console.log(chalk.green(`\n✓ 已同步 ${profiles.length} 个配置`));
    } else {
      // 同步单个配置
      if (!profile) {
        const { selectedProfile } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedProfile',
            message: '选择要同步的配置:',
            choices: [...profiles, new inquirer.Separator(), { name: '同步全部', value: '__all__' }]
          }
        ]);

        if (selectedProfile === '__all__') {
          // 递归调用同步全部
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `确定要同步所有 ${profiles.length} 个配置吗?`,
              default: false
            }
          ]);

          if (!confirm) {
            console.log(chalk.yellow('已取消'));
            process.exit(0);
          }

          profiles.forEach(name => {
            const result = syncProfile(name);
            console.log(chalk.green(`✓ ${name}`) + chalk.gray(` (保留: ${Object.keys(result.preserved).join(', ')})`));
          });

          console.log(chalk.green(`\n✓ 已同步 ${profiles.length} 个配置`));
          return;
        }

        profile = selectedProfile;
      }

      if (!profileExists(profile)) {
        console.log(chalk.red(`配置 "${profile}" 不存在`));
        process.exit(1);
      }

      // 显示将要进行的更改
      const profilePath = getProfilePath(profile);
      const currentSettings = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));

      console.log(chalk.cyan(`\n同步配置: ${profile}`));
      console.log(chalk.gray('将保留以下字段:'));
      preserveKeys.forEach(key => {
        const value = currentSettings[key];
        if (value !== undefined) {
          const display = key === 'apiKey' ? value.substring(0, 10) + '...' : value;
          console.log(chalk.gray(`  ${key}: ${display}`));
        }
      });

      const templateKeys = Object.keys(template).filter(k => !preserveKeys.includes(k));
      console.log(chalk.gray('\n将从模板同步:'));
      console.log(chalk.gray(`  ${templateKeys.join(', ') || '(无)'}`));
      console.log();

      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: '确认同步?',
          default: true
        }
      ]);

      if (!confirm) {
        console.log(chalk.yellow('已取消'));
        process.exit(0);
      }

      syncProfile(profile);
      console.log(chalk.green(`\n✓ 配置 "${profile}" 已同步`));
    }
  });

// ccc edit <profile>
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

    const profilePath = getProfilePath(profile);
    const currentSettings = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));

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
      fs.writeFileSync(newPath, JSON.stringify(newSettings, null, 2));
      fs.unlinkSync(profilePath);

      // 更新默认 profile
      if (getDefaultProfile() === profile) {
        setDefaultProfile(newName);
      }

      console.log(chalk.green(`\n✓ Profile 已重命名为 "${newName}" 并保存`));
    } else {
      fs.writeFileSync(profilePath, JSON.stringify(newSettings, null, 2));
      console.log(chalk.green(`\n✓ Profile "${profile}" 已更新`));
    }
  });

// ccc delete <profile>
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

    fs.unlinkSync(getProfilePath(profile));

    // 如果删除的是默认 profile，清除默认设置
    if (getDefaultProfile() === profile) {
      fs.unlinkSync(DEFAULT_FILE);
    }

    console.log(chalk.green(`✓ Profile "${profile}" 已删除`));
  });

// ccc <profile> 或 ccc (无参数)
// 使用 -d 或 --ddd 启用 dangerously-skip-permissions
program
  .argument('[profile]', '要使用的 profile 名称')
  .option('-d, --ddd', '启用 --dangerously-skip-permissions 参数')
  .action(async (profile, options) => {
    const dangerouslySkipPermissions = options.ddd || false;

    if (profile) {
      // 检查是否是子命令
      if (['list', 'ls', 'use', 'import', 'new', 'sync', 'edit', 'delete', 'rm', 'help'].includes(profile)) {
        return; // 让子命令处理
      }
      launchClaude(profile, dangerouslySkipPermissions);
    } else {
      // 无参数，检查默认或交互选择
      const defaultProfile = getDefaultProfile();
      if (defaultProfile && profileExists(defaultProfile)) {
        launchClaude(defaultProfile, dangerouslySkipPermissions);
      } else {
        await selectProfile(dangerouslySkipPermissions);
      }
    }
  });

program.parse();
