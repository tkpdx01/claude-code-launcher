import chalk from 'chalk';
import inquirer from 'inquirer';
import {
  getAllProfiles,
  getProfiles,
  getCodexProfiles,
  syncProfileWithTemplate,
  syncCodexProfileWithTemplate,
  getClaudeSettingsTemplate,
  resolveAnyProfile
} from '../profiles.js';
import { CODEX_HOME_PATH } from '../config.js';
import fs from 'fs';
import path from 'path';

export function syncCommand(program) {
  program
    .command('sync [profile]')
    .description('同步模板配置到 profile（保留 API 凭证）')
    .option('-a, --all', '同步所有 profiles')
    .action(async (profile, options) => {
      const allProfiles = getAllProfiles();

      if (allProfiles.length === 0) {
        console.log(chalk.yellow('没有可用的 profiles'));
        console.log(chalk.gray('使用 "ccc new" 创建配置'));
        process.exit(0);
      }

      // 同步所有
      if (options.all) {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: `确定要同步所有 ${allProfiles.length} 个 profiles 吗?`,
            default: false
          }
        ]);

        if (!confirm) {
          console.log(chalk.yellow('已取消'));
          process.exit(0);
        }

        console.log(chalk.cyan('\n开始同步所有 profiles...\n'));

        let successCount = 0;
        for (const p of allProfiles) {
          let result;
          if (p.type === 'codex') {
            const codexConfigPath = path.join(CODEX_HOME_PATH, 'config.toml');
            if (!fs.existsSync(codexConfigPath)) {
              console.log(chalk.yellow(`  ⚠ ${chalk.blue('[Codex]')} ${p.name} (无 ~/.codex/config.toml 模板，跳过)`));
              continue;
            }
            result = syncCodexProfileWithTemplate(p.name);
          } else {
            const template = getClaudeSettingsTemplate();
            if (!template) {
              console.log(chalk.yellow(`  ⚠ ${chalk.magenta('[Claude]')} ${p.name} (无 ~/.claude/settings.json 模板，跳过)`));
              continue;
            }
            result = syncProfileWithTemplate(p.name);
          }

          if (result) {
            const typeTag = p.type === 'codex' ? chalk.blue('[Codex]') : chalk.magenta('[Claude]');
            console.log(chalk.green(`  ✓ ${typeTag} ${p.name}`));
            successCount++;
          } else {
            console.log(chalk.red(`  ✗ ${p.name} (同步失败)`));
          }
        }

        console.log(chalk.green(`\n✓ 已同步 ${successCount}/${allProfiles.length} 个 profiles`));
        return;
      }

      // 同步单个
      let profileInfo;

      if (!profile) {
        const choices = allProfiles.map(p => {
          const typeTag = p.type === 'codex' ? chalk.blue('[Codex]') : chalk.magenta('[Claude]');
          return { name: `${typeTag} ${p.name}`, value: p };
        });

        const { selected } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selected',
            message: '选择要同步的配置:',
            choices
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

      let result;
      if (profileInfo.type === 'codex') {
        const codexConfigPath = path.join(CODEX_HOME_PATH, 'config.toml');
        if (!fs.existsSync(codexConfigPath)) {
          console.log(chalk.red('未找到 ~/.codex/config.toml'));
          console.log(chalk.gray('请确保 Codex CLI 已正确配置'));
          process.exit(1);
        }
        result = syncCodexProfileWithTemplate(profileInfo.name);
      } else {
        const template = getClaudeSettingsTemplate();
        if (!template) {
          console.log(chalk.red('未找到 ~/.claude/settings.json'));
          console.log(chalk.gray('请确保 Claude Code 已正确安装'));
          process.exit(1);
        }
        result = syncProfileWithTemplate(profileInfo.name);
      }

      const typeLabel = profileInfo.type === 'codex' ? 'Codex' : 'Claude';
      if (result) {
        console.log(chalk.green(`\n✓ ${typeLabel} Profile "${profileInfo.name}" 已同步（保留了 API 凭证）`));
      } else {
        console.log(chalk.red(`\n✗ 同步失败`));
        process.exit(1);
      }
    });
}
