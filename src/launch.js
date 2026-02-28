import chalk from 'chalk';
import inquirer from 'inquirer';
import { spawn } from 'child_process';
import {
  getAllProfiles,
  getDefaultProfile,
  profileExists,
  codexProfileExists,
  getProfilePath,
  getCodexProfileDir,
  getCodexProfileCredentials
} from './profiles.js';

// 启动 claude
export function launchClaude(profileName, dangerouslySkipPermissions = false) {
  const profilePath = getProfilePath(profileName);

  if (!profileExists(profileName)) {
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

// 启动 codex
export function launchCodex(profileName, dangerouslySkipPermissions = false) {
  const codexHome = getCodexProfileDir(profileName);

  if (!codexProfileExists(profileName)) {
    console.log(chalk.red(`Profile "${profileName}" 不存在`));
    console.log(chalk.yellow(`使用 "ccc list" 查看可用的 profiles`));
    process.exit(1);
  }

  const { baseUrl } = getCodexProfileCredentials(profileName);

  const args = [];
  if (dangerouslySkipPermissions) {
    args.push('--full-auto');
  }

  // 构建进程环境变量
  const env = { ...process.env, CODEX_HOME: codexHome };
  if (baseUrl && baseUrl !== 'https://api.openai.com/v1') {
    env.OPENAI_BASE_URL = baseUrl;
  }

  console.log(chalk.green(`启动 Codex，使用配置: ${profileName}`));
  console.log(chalk.gray(`CODEX_HOME=${codexHome} codex ${args.join(' ')}`));

  const child = spawn('codex', args, {
    stdio: 'inherit',
    shell: true,
    env
  });

  child.on('error', (err) => {
    console.log(chalk.red(`启动失败: ${err.message}`));
    process.exit(1);
  });
}

// 根据 profile 类型自动选择启动方式
export function launchProfile(profileName, type, dangerouslySkipPermissions = false) {
  if (type === 'codex') {
    launchCodex(profileName, dangerouslySkipPermissions);
  } else {
    launchClaude(profileName, dangerouslySkipPermissions);
  }
}

// 交互式选择 profile
export async function selectProfile(dangerouslySkipPermissions = false) {
  const allProfiles = getAllProfiles();

  if (allProfiles.length === 0) {
    console.log(chalk.yellow('没有可用的 profiles'));
    console.log(chalk.gray('使用 "ccc new" 创建配置'));
    process.exit(0);
  }

  const defaultProfile = getDefaultProfile();

  const choices = allProfiles.map((p, index) => {
    const typeTag = p.type === 'codex' ? chalk.blue('[Codex]') : chalk.magenta('[Claude]');
    const isDefault = p.name === defaultProfile;
    const label = isDefault
      ? `${index + 1}. ${typeTag} ${p.name} ${chalk.green('(默认)')}`
      : `${index + 1}. ${typeTag} ${p.name}`;
    return { name: label, value: p };
  });

  const { profile } = await inquirer.prompt([
    {
      type: 'list',
      name: 'profile',
      message: '选择要使用的配置:',
      choices,
      default: allProfiles.findIndex(p => p.name === defaultProfile)
    }
  ]);

  launchProfile(profile.name, profile.type, dangerouslySkipPermissions);
}
