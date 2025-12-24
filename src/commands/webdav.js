import chalk from 'chalk';
import inquirer from 'inquirer';
import { getProfiles } from '../profiles.js';
import {
  saveSyncPassword,
  loadSyncPassword,
  hasSyncPassword
} from '../crypto.js';
import {
  getWebDAVConfig,
  saveWebDAVConfig,
  createWebDAVClient,
  uploadProfiles,
  downloadProfiles,
  getRemoteInfo,
  compareProfiles,
  mergePull,
  mergePush
} from '../webdav.js';

// 获取或请求同步密码
async function getSyncPassword(forcePrompt = false) {
  if (!forcePrompt) {
    const cached = loadSyncPassword();
    if (cached) {
      return cached;
    }
  }

  const { password } = await inquirer.prompt([
    {
      type: 'password',
      name: 'password',
      message: '请输入同步密码:',
      mask: '*',
      validate: (input) => input.length >= 6 || '密码至少需要 6 个字符'
    }
  ]);

  return password;
}

// setup 子命令
async function setupAction() {
  console.log(chalk.cyan('\n配置 WebDAV 同步\n'));

  const existingConfig = getWebDAVConfig();

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'url',
      message: 'WebDAV 服务器地址:',
      default: existingConfig?.url || '',
      validate: (input) => {
        if (!input) return '请输入 WebDAV 地址';
        if (!input.startsWith('http://') && !input.startsWith('https://')) {
          return '地址必须以 http:// 或 https:// 开头';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'username',
      message: 'WebDAV 用户名:',
      default: existingConfig?.username || ''
    },
    {
      type: 'password',
      name: 'password',
      message: 'WebDAV 密码:',
      mask: '*'
    },
    {
      type: 'input',
      name: 'path',
      message: '远程存储路径:',
      default: existingConfig?.path || '/ccc-sync',
      validate: (input) => input.startsWith('/') || '路径必须以 / 开头'
    }
  ]);

  // 测试连接
  console.log(chalk.gray('\n测试连接...'));
  try {
    const client = createWebDAVClient(answers);
    await client.getDirectoryContents('/');
    console.log(chalk.green('✓ 连接成功'));
  } catch (err) {
    console.log(chalk.red(`✗ 连接失败: ${err.message}`));
    const { continueAnyway } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continueAnyway',
        message: '是否仍要保存配置？',
        default: false
      }
    ]);
    if (!continueAnyway) {
      process.exit(1);
    }
  }

  saveWebDAVConfig(answers);
  console.log(chalk.green('✓ WebDAV 配置已保存'));

  // 设置同步密码
  const hasPassword = hasSyncPassword();
  const { setupPassword } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'setupPassword',
      message: hasPassword ? '是否重新设置同步密码？' : '是否设置同步密码？',
      default: !hasPassword
    }
  ]);

  if (setupPassword) {
    const { newPassword, confirmPassword } = await inquirer.prompt([
      {
        type: 'password',
        name: 'newPassword',
        message: '设置同步密码 (用于加密云端数据):',
        mask: '*',
        validate: (input) => input.length >= 6 || '密码至少需要 6 个字符'
      },
      {
        type: 'password',
        name: 'confirmPassword',
        message: '确认同步密码:',
        mask: '*'
      }
    ]);

    if (newPassword !== confirmPassword) {
      console.log(chalk.red('✗ 两次输入的密码不一致'));
      process.exit(1);
    }

    saveSyncPassword(newPassword);
    console.log(chalk.green('✓ 同步密码已保存（本机免密）'));
  }

  console.log(chalk.cyan('\n配置完成！使用以下命令同步:'));
  console.log(chalk.gray('  ccc webdav push   - 推送到云端'));
  console.log(chalk.gray('  ccc webdav pull   - 从云端拉取'));
  console.log(chalk.gray('  ccc webdav status - 查看同步状态'));
}

// push 子命令
async function pushAction(options) {
  const config = getWebDAVConfig();
  if (!config) {
    console.log(chalk.red('请先运行 "ccc webdav setup" 配置 WebDAV'));
    process.exit(1);
  }

  const localProfiles = getProfiles();
  if (localProfiles.length === 0) {
    console.log(chalk.yellow('没有可同步的 profiles'));
    process.exit(0);
  }

  const syncPassword = await getSyncPassword();
  const client = createWebDAVClient(config);

  console.log(chalk.gray('\n检查远程状态...'));

  let remoteData = null;
  try {
    remoteData = await downloadProfiles(client, config, syncPassword);
  } catch (err) {
    if (err.message.includes('密码错误')) {
      console.log(chalk.red(`✗ ${err.message}`));
      process.exit(1);
    }
    // 远程可能不存在，继续
  }

  const diff = compareProfiles(localProfiles, remoteData);

  // 显示差异
  console.log(chalk.cyan('\n同步预览:'));

  if (diff.localOnly.length > 0) {
    console.log(chalk.green(`  ↑ 新增: ${diff.localOnly.join(', ')}`));
  }

  if (diff.remoteOnly.length > 0) {
    console.log(chalk.gray(`  ○ 远程独有 (保留): ${diff.remoteOnly.join(', ')}`));
  }

  const unchanged = diff.both.filter(n => !diff.conflicts.find(c => c.name === n));
  if (unchanged.length > 0) {
    console.log(chalk.gray(`  = 无变化: ${unchanged.join(', ')}`));
  }

  // 处理冲突
  const resolutions = {};

  if (diff.conflicts.length > 0 && !options.force) {
    console.log(chalk.yellow(`\n  ⚠️  发现 ${diff.conflicts.length} 个冲突:`));

    for (const conflict of diff.conflicts) {
      const remoteTime = new Date(conflict.remoteUpdatedAt).toLocaleString();
      console.log(chalk.yellow(`\n  "${conflict.name}" - 云端修改于 ${remoteTime}`));

      const { resolution } = await inquirer.prompt([
        {
          type: 'list',
          name: 'resolution',
          message: `如何处理 "${conflict.name}"？`,
          choices: [
            { name: '保留两者 (本地上传为 *_local)', value: 'keep_both' },
            { name: '使用本地版本覆盖云端', value: 'use_local' },
            { name: '保留云端版本', value: 'keep_remote' }
          ],
          default: 'keep_both'
        }
      ]);

      resolutions[conflict.name] = resolution;
    }
  } else if (diff.conflicts.length > 0 && options.force) {
    console.log(chalk.yellow(`  ⚠️  ${diff.conflicts.length} 个冲突将使用本地版本覆盖`));
    for (const conflict of diff.conflicts) {
      resolutions[conflict.name] = 'use_local';
    }
  }

  // 确认
  if (!options.force) {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: '确认推送？',
        default: true
      }
    ]);

    if (!confirm) {
      console.log(chalk.yellow('已取消'));
      process.exit(0);
    }
  }

  // 执行推送
  console.log(chalk.gray('\n正在推送...'));
  try {
    const result = await mergePush(client, config, syncPassword, diff.conflicts, resolutions);
    console.log(chalk.green(`\n✓ 已推送 ${result.count} 个 profiles 到云端`));
  } catch (err) {
    console.log(chalk.red(`\n✗ 推送失败: ${err.message}`));
    process.exit(1);
  }
}

// pull 子命令
async function pullAction(options) {
  const config = getWebDAVConfig();
  if (!config) {
    console.log(chalk.red('请先运行 "ccc webdav setup" 配置 WebDAV'));
    process.exit(1);
  }

  const syncPassword = await getSyncPassword();
  const client = createWebDAVClient(config);

  console.log(chalk.gray('\n正在获取云端数据...'));

  let remoteData = null;
  try {
    remoteData = await downloadProfiles(client, config, syncPassword);
  } catch (err) {
    console.log(chalk.red(`✗ ${err.message}`));
    process.exit(1);
  }

  if (!remoteData) {
    console.log(chalk.yellow('云端没有同步数据'));
    console.log(chalk.gray('使用 "ccc webdav push" 推送本地配置'));
    process.exit(0);
  }

  const localProfiles = getProfiles();
  const diff = compareProfiles(localProfiles, remoteData);

  // 显示差异
  console.log(chalk.cyan('\n同步预览:'));

  if (diff.remoteOnly.length > 0) {
    console.log(chalk.green(`  ↓ 新增: ${diff.remoteOnly.join(', ')}`));
  }

  if (diff.localOnly.length > 0) {
    console.log(chalk.gray(`  ○ 本地独有 (保留): ${diff.localOnly.join(', ')}`));
  }

  const unchanged = diff.both.filter(n => !diff.conflicts.find(c => c.name === n));
  if (unchanged.length > 0) {
    console.log(chalk.gray(`  = 无变化: ${unchanged.join(', ')}`));
  }

  // 处理冲突
  const resolutions = {};

  if (diff.conflicts.length > 0 && !options.force) {
    console.log(chalk.yellow(`\n  ⚠️  发现 ${diff.conflicts.length} 个冲突:`));

    for (const conflict of diff.conflicts) {
      const remoteTime = new Date(conflict.remoteUpdatedAt).toLocaleString();
      console.log(chalk.yellow(`\n  "${conflict.name}" - 云端修改于 ${remoteTime}`));

      const { resolution } = await inquirer.prompt([
        {
          type: 'list',
          name: 'resolution',
          message: `如何处理 "${conflict.name}"？`,
          choices: [
            { name: '保留两者 (云端保存为 *_cloud)', value: 'keep_both' },
            { name: '使用云端版本覆盖本地', value: 'use_remote' },
            { name: '保留本地版本', value: 'keep_local' }
          ],
          default: 'keep_both'
        }
      ]);

      resolutions[conflict.name] = resolution;
    }
  } else if (diff.conflicts.length > 0 && options.force) {
    console.log(chalk.yellow(`  ⚠️  ${diff.conflicts.length} 个冲突将使用云端版本覆盖`));
    for (const conflict of diff.conflicts) {
      resolutions[conflict.name] = 'use_remote';
    }
  }

  // 如果没有任何变化
  if (diff.remoteOnly.length === 0 && diff.conflicts.length === 0) {
    console.log(chalk.green('\n✓ 本地已是最新'));
    process.exit(0);
  }

  // 确认
  if (!options.force) {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: '确认拉取？',
        default: true
      }
    ]);

    if (!confirm) {
      console.log(chalk.yellow('已取消'));
      process.exit(0);
    }
  }

  // 执行拉取
  console.log(chalk.gray('\n正在拉取...'));
  const result = mergePull(remoteData, diff.conflicts, resolutions);

  if (result.imported.length > 0) {
    console.log(chalk.green(`  ✓ 导入: ${result.imported.join(', ')}`));
  }
  if (result.renamed.length > 0) {
    for (const r of result.renamed) {
      console.log(chalk.cyan(`  ✓ ${r.original} → ${r.renamed}`));
    }
  }
  if (result.skipped.length > 0) {
    console.log(chalk.gray(`  ○ 跳过: ${result.skipped.join(', ')}`));
  }

  const total = result.imported.length + result.renamed.length;
  console.log(chalk.green(`\n✓ 已拉取 ${total} 个 profiles`));
}

// status 子命令
async function statusAction() {
  const config = getWebDAVConfig();
  if (!config) {
    console.log(chalk.red('请先运行 "ccc webdav setup" 配置 WebDAV'));
    process.exit(1);
  }

  console.log(chalk.cyan('\nWebDAV 同步状态\n'));
  console.log(chalk.gray(`服务器: ${config.url}`));
  console.log(chalk.gray(`路径: ${config.path}`));
  console.log(chalk.gray(`本机免密: ${hasSyncPassword() ? '是' : '否'}`));

  const syncPassword = await getSyncPassword();
  const client = createWebDAVClient(config);

  console.log(chalk.gray('\n检查远程状态...'));

  const remoteInfo = await getRemoteInfo(client, config, syncPassword);
  const localProfiles = getProfiles();

  console.log(chalk.cyan('\n本地:'));
  console.log(`  Profiles: ${localProfiles.length}`);
  if (localProfiles.length > 0) {
    console.log(chalk.gray(`  ${localProfiles.join(', ')}`));
  }

  console.log(chalk.cyan('\n云端:'));
  if (remoteInfo.exists) {
    console.log(`  Profiles: ${remoteInfo.profileCount}`);
    console.log(`  最后更新: ${new Date(remoteInfo.updatedAt).toLocaleString()}`);
    if (remoteInfo.profileNames.length > 0) {
      console.log(chalk.gray(`  ${remoteInfo.profileNames.join(', ')}`));
    }
  } else if (remoteInfo.error) {
    console.log(chalk.red(`  错误: ${remoteInfo.error}`));
  } else {
    console.log(chalk.gray('  (无数据)'));
  }

  // 比较差异
  if (remoteInfo.exists) {
    let remoteData = null;
    try {
      remoteData = await downloadProfiles(client, config, syncPassword);
    } catch {
      // ignore
    }

    if (remoteData) {
      const diff = compareProfiles(localProfiles, remoteData);

      console.log(chalk.cyan('\n差异:'));
      if (diff.localOnly.length > 0) {
        console.log(chalk.green(`  本地新增: ${diff.localOnly.join(', ')}`));
      }
      if (diff.remoteOnly.length > 0) {
        console.log(chalk.blue(`  云端新增: ${diff.remoteOnly.join(', ')}`));
      }
      if (diff.conflicts.length > 0) {
        console.log(chalk.yellow(`  有冲突: ${diff.conflicts.map(c => c.name).join(', ')}`));
      }
      if (diff.localOnly.length === 0 && diff.remoteOnly.length === 0 && diff.conflicts.length === 0) {
        console.log(chalk.green('  ✓ 已同步'));
      }
    }
  }
}

export function webdavCommand(program) {
  const webdav = program
    .command('webdav')
    .description('WebDAV 云同步');

  webdav
    .command('setup')
    .description('配置 WebDAV 连接和同步密码')
    .action(setupAction);

  webdav
    .command('push')
    .description('推送本地 profiles 到云端')
    .option('-f, --force', '强制覆盖，跳过冲突确认')
    .action(pushAction);

  webdav
    .command('pull')
    .description('从云端拉取 profiles 到本地')
    .option('-f, --force', '强制覆盖，跳过冲突确认')
    .action(pullAction);

  webdav
    .command('status')
    .description('查看同步状态')
    .action(statusAction);
}
