import chalk from 'chalk';
import inquirer from 'inquirer';
import { 
  getProfiles, 
  getDefaultProfile, 
  profileExists, 
  getProfilePath, 
  readProfile 
} from '../profiles.js';
import { formatValue } from '../utils.js';

export function showCommand(program) {
  program
    .command('show [profile]')
    .description('显示 profile 的完整配置')
    .action(async (profile) => {
      const profiles = getProfiles();

      if (profiles.length === 0) {
        console.log(chalk.yellow('没有可用的 profiles'));
        process.exit(0);
      }

      // 如果没有指定 profile，交互选择
      if (!profile) {
        const defaultProfile = getDefaultProfile();
        const { selectedProfile } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedProfile',
            message: '选择要查看的配置:',
            choices: profiles,
            default: defaultProfile
          }
        ]);
        profile = selectedProfile;
      }

      if (!profileExists(profile)) {
        console.log(chalk.red(`Profile "${profile}" 不存在`));
        process.exit(1);
      }

      const profilePath = getProfilePath(profile);
      const settings = readProfile(profile);
      const isDefault = getDefaultProfile() === profile;

      console.log(chalk.cyan.bold(`\n  Profile: ${profile}`) + (isDefault ? chalk.green(' (默认)') : ''));
      console.log(chalk.gray(`  路径: ${profilePath}\n`));

      // 格式化显示配置
      Object.entries(settings).forEach(([key, value]) => {
        const formattedValue = formatValue(key, value);
        if ((key === 'apiKey' || key === 'ANTHROPIC_AUTH_TOKEN') && value) {
          console.log(`  ${chalk.cyan(key)}: ${chalk.yellow(formattedValue)}`);
        } else if (typeof value === 'boolean') {
          console.log(`  ${chalk.cyan(key)}: ${value ? chalk.green(formattedValue) : chalk.red(formattedValue)}`);
        } else if (typeof value === 'object') {
          console.log(`  ${chalk.cyan(key)}: ${chalk.gray(formattedValue)}`);
        } else {
          console.log(`  ${chalk.cyan(key)}: ${chalk.white(formattedValue)}`);
        }
      });

      console.log();
    });
}

