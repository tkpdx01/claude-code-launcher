import chalk from 'chalk';

export function showHelp() {
  console.log(chalk.cyan.bold('\n  CCC - Claude Code Settings Launcher\n'));
  console.log(chalk.white('  管理多个 Claude Code 配置文件，快速切换不同的 API 设置\n'));

  console.log(chalk.yellow('  启动命令:'));
  console.log(chalk.gray('    ccc                    ') + '使用默认配置启动，无默认则交互选择');
  console.log(chalk.gray('    ccc <profile>          ') + '使用指定配置启动（支持名称或序号）');
  console.log(chalk.gray('    ccc <序号>             ') + '使用序号启动（如 ccc 1）');
  console.log(chalk.gray('    ccc -d, --ddd          ') + '启动时添加 --dangerously-skip-permissions');
  console.log();

  console.log(chalk.yellow('  管理命令:'));
  console.log(chalk.gray('    ccc list, ls           ') + '列出所有配置（带序号，按 a-z 排序）');
  console.log(chalk.gray('    ccc show [profile]     ') + '显示完整配置');
  console.log(chalk.gray('    ccc use <profile>      ') + '设置默认配置');
  console.log(chalk.gray('    ccc new [name]         ') + '基于模板创建新配置');
  console.log(chalk.gray('    ccc import <file>      ') + '从文件导入（自动识别格式）');
  console.log(chalk.gray('    ccc sync [profile]     ') + '同步模板设置（保留 API 配置）');
  console.log(chalk.gray('    ccc sync -a, --all     ') + '同步所有配置');
  console.log(chalk.gray('    ccc edit [profile]     ') + '编辑配置');
  console.log(chalk.gray('    ccc delete, rm [name]  ') + '删除配置');
  console.log(chalk.gray('    ccc help               ') + '显示此帮助信息');
  console.log();

  console.log(chalk.yellow('  配置存储:'));
  console.log(chalk.gray('    ~/.ccc/profiles/       ') + '配置文件目录');
  console.log(chalk.gray('    ~/.claude/settings.json') + '模板来源（用于 ccc new）');
  console.log();

  console.log(chalk.yellow('  支持的导入格式:'));
  console.log(chalk.gray('    CC-Switch SQL          ') + '自动识别 INSERT INTO providers 语句');
  console.log(chalk.gray('    All API Hub JSON       ') + '自动识别 accounts.accounts 结构');
  console.log();

  console.log(chalk.yellow('  示例:'));
  console.log(chalk.gray('    ccc ls                 ') + '查看配置列表和序号');
  console.log(chalk.gray('    ccc 3                  ') + '启动第 3 个配置');
  console.log(chalk.gray('    ccc 3 -d               ') + '启动第 3 个配置 + 跳过权限');
  console.log(chalk.gray('    ccc kfc                ') + '使用名称启动');
  console.log(chalk.gray('    ccc import export.sql  ') + '从文件导入配置');
  console.log();
}

export function helpCommand(program) {
  program
    .command('help')
    .description('显示帮助信息')
    .action(showHelp);
}

