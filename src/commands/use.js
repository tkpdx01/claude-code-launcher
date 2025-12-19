import chalk from 'chalk';
import { profileExists, setDefaultProfile } from '../profiles.js';

export function useCommand(program) {
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
}

