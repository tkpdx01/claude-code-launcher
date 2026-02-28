import chalk from 'chalk';
import { anyProfileExists, resolveAnyProfile, setDefaultProfile } from '../profiles.js';

export function useCommand(program) {
  program
    .command('use <profile>')
    .description('设置默认 profile')
    .action((profile) => {
      const resolved = resolveAnyProfile(profile);
      if (!resolved) {
        console.log(chalk.red(`Profile "${profile}" 不存在`));
        console.log(chalk.yellow(`使用 "ccc list" 查看可用的 profiles`));
        process.exit(1);
      }

      const typeTag = resolved.type === 'codex' ? chalk.blue('[Codex]') : chalk.magenta('[Claude]');
      setDefaultProfile(resolved.name);
      console.log(chalk.green(`✓ 默认 profile 已设置为 ${typeTag} "${resolved.name}"`));
    });
}
