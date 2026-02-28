import chalk from 'chalk';
import inquirer from 'inquirer';
import {
  getAllProfiles,
  getDefaultProfile,
  anyProfileExists,
  resolveAnyProfile,
  getProfilePath,
  getCodexProfileDir,
  readProfile,
  readCodexProfile,
  getCodexProfileCredentials
} from '../profiles.js';
import { formatValue } from '../utils.js';

export function showCommand(program) {
  program
    .command('show [profile]')
    .description('显示 profile 的完整配置')
    .action(async (profile) => {
      const allProfiles = getAllProfiles();

      if (allProfiles.length === 0) {
        console.log(chalk.yellow('没有可用的 profiles'));
        process.exit(0);
      }

      let profileInfo;

      if (!profile) {
        const defaultProfile = getDefaultProfile();
        const choices = allProfiles.map(p => {
          const typeTag = p.type === 'codex' ? chalk.blue('[Codex]') : chalk.magenta('[Claude]');
          return { name: `${typeTag} ${p.name}`, value: p };
        });

        const { selected } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selected',
            message: '选择要查看的配置:',
            choices,
            default: allProfiles.findIndex(p => p.name === defaultProfile)
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

      const isDefault = getDefaultProfile() === profileInfo.name;

      if (profileInfo.type === 'codex') {
        const dir = getCodexProfileDir(profileInfo.name);
        const codexProfile = readCodexProfile(profileInfo.name);
        const { apiKey, baseUrl, model } = getCodexProfileCredentials(profileInfo.name);

        console.log(chalk.cyan.bold(`\n  Profile: ${profileInfo.name}`) + ` ${chalk.blue('[Codex]')}` + (isDefault ? chalk.green(' (默认)') : ''));
        console.log(chalk.gray(`  路径: ${dir}\n`));

        console.log(`  ${chalk.cyan('OPENAI_API_KEY')}: ${chalk.yellow(apiKey ? apiKey.substring(0, 15) + '...' : '未设置')}`);
        console.log(`  ${chalk.cyan('Base URL')}: ${chalk.white(baseUrl)}`);
        console.log(`  ${chalk.cyan('Model')}: ${chalk.white(model || '(默认)')}`);

        if (codexProfile?.configToml) {
          console.log(`\n  ${chalk.cyan('config.toml')}:`);
          codexProfile.configToml.split('\n').forEach(line => {
            console.log(`    ${chalk.gray(line)}`);
          });
        }
      } else {
        const profilePath = getProfilePath(profileInfo.name);
        const settings = readProfile(profileInfo.name);

        console.log(chalk.cyan.bold(`\n  Profile: ${profileInfo.name}`) + ` ${chalk.magenta('[Claude]')}` + (isDefault ? chalk.green(' (默认)') : ''));
        console.log(chalk.gray(`  路径: ${profilePath}\n`));

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
      }

      console.log();
    });
}
