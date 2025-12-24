import { createClient } from 'webdav';
import fs from 'fs';
import path from 'path';
import { CONFIG_DIR, PROFILES_DIR } from './config.js';
import { encrypt, decrypt } from './crypto.js';
import { getProfiles, readProfile, saveProfile } from './profiles.js';

const WEBDAV_CONFIG_FILE = path.join(CONFIG_DIR, 'webdav.json');
const REMOTE_FILE_NAME = 'ccc-profiles.encrypted';

// 读取 WebDAV 配置
export function getWebDAVConfig() {
  if (!fs.existsSync(WEBDAV_CONFIG_FILE)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(WEBDAV_CONFIG_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

// 保存 WebDAV 配置
export function saveWebDAVConfig(config) {
  fs.writeFileSync(WEBDAV_CONFIG_FILE, JSON.stringify(config, null, 2));
}

// 创建 WebDAV 客户端
export function createWebDAVClient(config) {
  return createClient(config.url, {
    username: config.username,
    password: config.password
  });
}

// 获取远程文件路径
function getRemotePath(config) {
  const basePath = config.path || '/';
  return path.posix.join(basePath, REMOTE_FILE_NAME);
}

// 上传加密的 profiles 到 WebDAV
export async function uploadProfiles(client, config, syncPassword) {
  const profiles = getProfiles();
  const profilesData = {};

  for (const name of profiles) {
    const profile = readProfile(name);
    if (profile) {
      profilesData[name] = {
        data: profile,
        updatedAt: Date.now()
      };
    }
  }

  const payload = {
    version: 1,
    updatedAt: Date.now(),
    profiles: profilesData
  };

  const encrypted = encrypt(JSON.stringify(payload), syncPassword);
  const remotePath = getRemotePath(config);

  // 确保目录存在
  const baseDir = config.path || '/';
  try {
    await client.createDirectory(baseDir, { recursive: true });
  } catch {
    // 目录可能已存在
  }

  await client.putFileContents(remotePath, encrypted);
  return { count: profiles.length, updatedAt: payload.updatedAt };
}

// 从 WebDAV 下载加密的 profiles
export async function downloadProfiles(client, config, syncPassword) {
  const remotePath = getRemotePath(config);

  try {
    const exists = await client.exists(remotePath);
    if (!exists) {
      return null;
    }
  } catch {
    return null;
  }

  const encrypted = await client.getFileContents(remotePath);
  const decrypted = decrypt(Buffer.from(encrypted), syncPassword);
  return JSON.parse(decrypted);
}

// 获取远程文件信息
export async function getRemoteInfo(client, config, syncPassword) {
  try {
    const data = await downloadProfiles(client, config, syncPassword);
    if (!data) {
      return { exists: false };
    }
    return {
      exists: true,
      updatedAt: data.updatedAt,
      profileCount: Object.keys(data.profiles).length,
      profileNames: Object.keys(data.profiles)
    };
  } catch (err) {
    return { exists: false, error: err.message };
  }
}

// 比较本地和远程 profiles，返回差异
export function compareProfiles(localProfiles, remoteData) {
  const local = new Set(localProfiles);
  const remote = new Set(remoteData ? Object.keys(remoteData.profiles) : []);

  const result = {
    localOnly: [],      // 只在本地存在
    remoteOnly: [],     // 只在远程存在
    both: [],           // 两边都有
    conflicts: []       // 两边都有且内容不同
  };

  // 本地存在的
  for (const name of local) {
    if (remote.has(name)) {
      result.both.push(name);
    } else {
      result.localOnly.push(name);
    }
  }

  // 只在远程存在的
  for (const name of remote) {
    if (!local.has(name)) {
      result.remoteOnly.push(name);
    }
  }

  // 检查内容是否相同
  if (remoteData) {
    for (const name of result.both) {
      const localProfile = readProfile(name);
      const remoteProfile = remoteData.profiles[name].data;

      if (JSON.stringify(localProfile) !== JSON.stringify(remoteProfile)) {
        result.conflicts.push({
          name,
          localData: localProfile,
          remoteData: remoteProfile,
          remoteUpdatedAt: remoteData.profiles[name].updatedAt
        });
      }
    }
  }

  return result;
}

// 执行最大合并的 pull 操作
export function mergePull(remoteData, conflicts, resolutions) {
  const imported = [];
  const skipped = [];
  const renamed = [];

  if (!remoteData) {
    return { imported, skipped, renamed };
  }

  const localProfiles = new Set(getProfiles());

  for (const [name, profileData] of Object.entries(remoteData.profiles)) {
    const conflict = conflicts.find(c => c.name === name);

    if (conflict) {
      // 有冲突
      const resolution = resolutions[name] || 'keep_both';

      if (resolution === 'use_remote') {
        saveProfile(name, profileData.data);
        imported.push(name);
      } else if (resolution === 'keep_local') {
        skipped.push(name);
      } else {
        // keep_both: 保留两者，远程版本重命名
        const newName = `${name}_cloud`;
        saveProfile(newName, profileData.data);
        renamed.push({ original: name, renamed: newName });
      }
    } else if (!localProfiles.has(name)) {
      // 本地不存在，直接导入
      saveProfile(name, profileData.data);
      imported.push(name);
    }
  }

  return { imported, skipped, renamed };
}

// 执行最大合并的 push 操作
export async function mergePush(client, config, syncPassword, conflicts, resolutions) {
  const localProfiles = getProfiles();
  let remoteData = null;

  try {
    remoteData = await downloadProfiles(client, config, syncPassword);
  } catch {
    // 远程可能不存在
  }

  const profilesData = {};

  // 保留远程独有的（最大合并）
  if (remoteData) {
    const localSet = new Set(localProfiles);
    for (const [name, data] of Object.entries(remoteData.profiles)) {
      if (!localSet.has(name)) {
        profilesData[name] = data;
      }
    }
  }

  // 添加本地的
  for (const name of localProfiles) {
    const profile = readProfile(name);
    if (!profile) continue;

    const conflict = conflicts.find(c => c.name === name);
    if (conflict) {
      const resolution = resolutions[name] || 'keep_both';

      if (resolution === 'use_local') {
        profilesData[name] = { data: profile, updatedAt: Date.now() };
      } else if (resolution === 'keep_remote') {
        // 保留远程版本
        profilesData[name] = remoteData.profiles[name];
      } else {
        // keep_both: 保留两者，本地版本用 _local 后缀
        profilesData[name] = remoteData.profiles[name]; // 保留原名为远程版本
        profilesData[`${name}_local`] = { data: profile, updatedAt: Date.now() };
      }
    } else {
      profilesData[name] = { data: profile, updatedAt: Date.now() };
    }
  }

  const payload = {
    version: 1,
    updatedAt: Date.now(),
    profiles: profilesData
  };

  const encrypted = encrypt(JSON.stringify(payload), syncPassword);
  const remotePath = getRemotePath(config);

  // 确保目录存在
  const baseDir = config.path || '/';
  try {
    await client.createDirectory(baseDir, { recursive: true });
  } catch {
    // 目录可能已存在
  }

  await client.putFileContents(remotePath, encrypted);
  return { count: Object.keys(profilesData).length };
}
