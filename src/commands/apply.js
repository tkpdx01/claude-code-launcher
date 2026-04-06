import chalk from 'chalk';
import inquirer from 'inquirer';
import {
  getAllProfiles,
  resolveAnyProfile,
  applyClaudeProfile,
  applyCodexProfile
} from '../profiles.js';

export function applyCommand(program) {
  program
    .command('apply [profile]')
    .description('将 profile 的配置应用到默认目录（~/.claude 或 ~/.codex）')
    .action(async (profile) => {
      const allProfiles = getAllProfiles();

      if (allProfiles.length === 0) {
        console.log(chalk.yellow('没有可用的 profiles'));
        console.log(chalk.gray('使用 "ccc new" 创建配置'));
        process.exit(0);
      }

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
            message: '选择要应用的配置:',
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

      const typeLabel = profileInfo.type === 'codex' ? 'Codex' : 'Claude';
      const targetDir = profileInfo.type === 'codex' ? '~/.codex/' : '~/.claude/settings.json';

      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `将 ${typeLabel} 配置 "${profileInfo.name}" 应用到 ${targetDir}？（会覆盖当前配置）`,
          default: false
        }
      ]);

      if (!confirm) {
        console.log(chalk.yellow('已取消'));
        process.exit(0);
      }

      let result;
      if (profileInfo.type === 'codex') {
        result = applyCodexProfile(profileInfo.name);
      } else {
        result = applyClaudeProfile(profileInfo.name);
      }

      const success = profileInfo.type === 'codex'
        ? Boolean(result && (result.success ?? result))
        : Boolean(result);

      if (success) {
        console.log(chalk.green(`\n✓ ${typeLabel} 配置 "${profileInfo.name}" 已应用到 ${targetDir}`));

        if (profileInfo.type === 'codex' && result?.envSync?.changed && result?.envSync?.filePath) {
          const home = process.env.HOME || '';
          const rcPathDisplay = home && result.envSync.filePath.startsWith(home)
            ? `~${result.envSync.filePath.slice(home.length)}`
            : result.envSync.filePath;
          if (result.envSync.removedDeprecatedBaseUrl && result.envSync.apiKeyChanged) {
            console.log(chalk.gray(`  已从 ${rcPathDisplay} 清理 deprecated 的 OPENAI_BASE_URL，并同步 OPENAI_API_KEY`));
          } else if (result.envSync.removedDeprecatedBaseUrl) {
            console.log(chalk.gray(`  已从 ${rcPathDisplay} 清理 deprecated 的 OPENAI_BASE_URL`));
          } else if (result.envSync.apiKeyChanged) {
            console.log(chalk.gray(`  已同步 OPENAI_API_KEY 到 ${rcPathDisplay}`));
          }
          console.log(chalk.gray(`  当前终端可执行: source ${rcPathDisplay}`));
        }
      } else {
        console.log(chalk.red(`\n✗ 应用失败`));
        process.exit(1);
      }
    });
}
