import chalk from 'chalk';
import inquirer from 'inquirer';
import { spawn } from 'child_process';
import { 
  getProfiles, 
  getDefaultProfile, 
  profileExists, 
  getProfilePath 
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

// 交互式选择 profile
export async function selectProfile(dangerouslySkipPermissions = false) {
  const profiles = getProfiles();

  if (profiles.length === 0) {
    console.log(chalk.yellow('没有可用的 profiles'));
    console.log(chalk.gray('使用 "ccc import" 导入配置'));
    process.exit(0);
  }

  const defaultProfile = getDefaultProfile();

  const choices = profiles.map((p, index) => ({
    name: p === defaultProfile ? `${index + 1}. ${p} ${chalk.green('(默认)')}` : `${index + 1}. ${p}`,
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

