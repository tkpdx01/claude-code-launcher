import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CONFIG_DIR } from './config.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const AUTH_TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;
const FILE_MAGIC = 'CCC_V1';
const SYNC_KEY_FILE = path.join(CONFIG_DIR, '.sync_key');

// 获取机器指纹（用于本地密码缓存加密）
function getMachineFingerprint() {
  const hostname = os.hostname();
  const username = os.userInfo().username;
  const platform = os.platform();
  const arch = os.arch();
  // 组合多个机器特征生成指纹
  const fingerprint = `${hostname}:${username}:${platform}:${arch}:ccc-sync`;
  return crypto.createHash('sha256').update(fingerprint).digest();
}

// 从密码派生加密密钥
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

// 加密数据
export function encrypt(plaintext, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(password, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // 格式: MAGIC + salt + iv + authTag + encrypted
  const magic = Buffer.from(FILE_MAGIC, 'utf8');
  return Buffer.concat([magic, salt, iv, authTag, encrypted]);
}

// 解密数据
export function decrypt(encryptedBuffer, password) {
  const magic = Buffer.from(FILE_MAGIC, 'utf8');
  const magicLength = magic.length;

  // 验证 magic header
  if (encryptedBuffer.length < magicLength + SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('无效的加密文件格式');
  }

  const fileMagic = encryptedBuffer.subarray(0, magicLength);
  if (!fileMagic.equals(magic)) {
    throw new Error('无效的加密文件格式');
  }

  let offset = magicLength;
  const salt = encryptedBuffer.subarray(offset, offset + SALT_LENGTH);
  offset += SALT_LENGTH;
  const iv = encryptedBuffer.subarray(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;
  const authTag = encryptedBuffer.subarray(offset, offset + AUTH_TAG_LENGTH);
  offset += AUTH_TAG_LENGTH;
  const encrypted = encryptedBuffer.subarray(offset);

  const key = deriveKey(password, salt);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    throw new Error('解密失败：密码错误或数据损坏');
  }
}

// 使用机器指纹加密本地密码缓存
export function encryptLocalPassword(password) {
  const key = getMachineFingerprint();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]);
}

// 使用机器指纹解密本地密码缓存
export function decryptLocalPassword(encryptedBuffer) {
  if (encryptedBuffer.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('无效的本地密码缓存');
  }

  const key = getMachineFingerprint();
  const iv = encryptedBuffer.subarray(0, IV_LENGTH);
  const authTag = encryptedBuffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = encryptedBuffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    throw new Error('本地密码缓存解密失败');
  }
}

// 保存同步密码到本地（加密存储）
export function saveSyncPassword(password) {
  const encrypted = encryptLocalPassword(password);
  fs.writeFileSync(SYNC_KEY_FILE, encrypted);
}

// 读取本地缓存的同步密码
export function loadSyncPassword() {
  if (!fs.existsSync(SYNC_KEY_FILE)) {
    return null;
  }
  try {
    const encrypted = fs.readFileSync(SYNC_KEY_FILE);
    return decryptLocalPassword(encrypted);
  } catch (err) {
    return null;
  }
}

// 检查是否有本地缓存的密码
export function hasSyncPassword() {
  return fs.existsSync(SYNC_KEY_FILE);
}

// 清除本地缓存的密码
export function clearSyncPassword() {
  if (fs.existsSync(SYNC_KEY_FILE)) {
    fs.unlinkSync(SYNC_KEY_FILE);
  }
}
