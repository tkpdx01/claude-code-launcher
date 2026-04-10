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
  getCodexProfileCredentials,
  readProfile,
  isClaudeModelOverrideEnvKey
} from './profiles.js';

// 启动 claude
export function launchClaude(profileName, dangerouslySkipPermissions = false) {
  const profilePath = getProfilePath(profileName);

  if (!profileExists(profileName)) {
    console.log(chalk.red(`Profile "${profileName}" 不存在`));
    console.log(chalk.yellow(`使用 "ccc list" 查看可用的 profiles`));
    process.exit(1);
  }

  // 读取 profile 获取 env 变量
  const profile = readProfile(profileName);
  const profileEnv = (profile && profile.env) || {};

  // 将 profile env 注入子进程环境变量，确保 API 凭证优先于 ~/.claude/settings.json。
  // 这样就不必排除 user setting source，~/.claude/commands/ 也能正常加载。
  const childEnv = { ...process.env };
  for (const [key, value] of Object.entries(profileEnv)) {
    childEnv[key] = value;
  }

  // 删除不在 profile 中的模型覆盖环境变量
  // （profile 模板已刻意移除这些变量，避免从 shell 环境或 user settings 继承）
  for (const key of Object.keys(childEnv)) {
    if (isClaudeModelOverrideEnvKey(key) && !(key in profileEnv)) {
      delete childEnv[key];
    }
  }

  // 使用默认 setting-sources（包含 user），让 ~/.claude/commands/ 能被加载。
  // profile env 通过进程环境变量注入，优先级高于 settings.json 的 env 设定。
  const args = ['--settings', profilePath];
  if (dangerouslySkipPermissions) {
    args.push('--dangerously-skip-permissions');
  }

  console.log(chalk.green(`启动 Claude Code，使用配置: ${profileName}`));
  console.log(chalk.gray(`命令: claude ${args.join(' ')}`));

  const child = spawn('claude', args, {
    stdio: 'inherit',
    shell: true,
    env: childEnv
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

  const { apiKey } = getCodexProfileCredentials(profileName);

  const args = [];
  if (dangerouslySkipPermissions) {
    args.push('--full-auto');
  }

  // 构建进程环境变量
  const env = { ...process.env, CODEX_HOME: codexHome };
  // `OPENAI_BASE_URL` 已废弃，优先使用 profile 内 config.toml 的 endpoint/provider 配置。
  delete env.OPENAI_BASE_URL;
  if (apiKey) {
    env.OPENAI_API_KEY = apiKey;
  } else {
    delete env.OPENAI_API_KEY;
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
