import chalk from 'chalk';
import inquirer from 'inquirer';
import { 
  getProfiles, 
  profileExists, 
  getProfilePath, 
  readProfile, 
  saveProfile, 
  getClaudeSettingsTemplate 
} from '../profiles.js';

export function syncCommand(program) {
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

      // 需要保留的字段（每个 profile 独立的设置）
      const preserveKeys = ['apiUrl', 'apiKey', 'includeCoAuthoredBy', 'model'];

      // 同步单个配置的函数
      const syncProfile = (name) => {
        const currentSettings = readProfile(name);

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

        saveProfile(name, newSettings);
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
        const currentSettings = readProfile(profile);

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
}

