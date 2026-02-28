#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import {
  getDefaultProfile,
  anyProfileExists,
  resolveAnyProfile
} from './src/profiles.js';
import { launchProfile, selectProfile } from './src/launch.js';
import {
  listCommand,
  useCommand,
  showCommand,
  newCommand,
  editCommand,
  deleteCommand,
  syncCommand,
  applyCommand,
  webdavCommand,
  helpCommand
} from './src/commands/index.js';

const program = new Command();

// 主程序
program
  .name('ccc')
  .description('Claude Code / Codex Settings Launcher - 管理多个 Claude Code 和 Codex 配置文件')
  .version('1.6.0');

// 注册所有命令
listCommand(program);
useCommand(program);
showCommand(program);
newCommand(program);
editCommand(program);
deleteCommand(program);
syncCommand(program);
applyCommand(program);
webdavCommand(program);
helpCommand(program);

// ccc <profile> 或 ccc (无参数)
// 使用 -d 或 --ddd 启用 dangerously-skip-permissions / full-auto
program
  .argument('[profile]', '要使用的 profile 名称或序号')
  .option('-d, --ddd', '启用 --dangerously-skip-permissions (Claude) 或 --full-auto (Codex)')
  .action(async (profile, options) => {
    const dangerouslySkipPermissions = options.ddd || false;

    if (profile) {
      // 检查是否是子命令
      if (['list', 'ls', 'use', 'show', 'new', 'edit', 'delete', 'rm', 'sync', 'apply', 'webdav', 'help'].includes(profile)) {
        return; // 让子命令处理
      }

      // 解析序号或名称（统一）
      const resolved = resolveAnyProfile(profile);
      if (resolved) {
        launchProfile(resolved.name, resolved.type, dangerouslySkipPermissions);
      } else {
        console.log(chalk.red(`Profile "${profile}" 不存在`));
        console.log(chalk.yellow(`使用 "ccc list" 查看可用的 profiles`));
        process.exit(1);
      }
    } else {
      // 无参数，检查默认或交互选择
      const defaultProfile = getDefaultProfile();
      if (defaultProfile) {
        const check = anyProfileExists(defaultProfile);
        if (check.exists) {
          launchProfile(defaultProfile, check.type, dangerouslySkipPermissions);
        } else {
          await selectProfile(dangerouslySkipPermissions);
        }
      } else {
        await selectProfile(dangerouslySkipPermissions);
      }
    }
  });

program.parse();
