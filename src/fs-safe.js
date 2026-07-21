import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const PRIVATE_DIR_MODE = 0o700;
export const PRIVATE_FILE_MODE = 0o600;

function chmodSafe(target, mode) {
  try {
    fs.chmodSync(target, mode);
  } catch (err) {
    if (process.platform !== 'win32') throw err;
  }
}

export function ensurePrivateDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: PRIVATE_DIR_MODE });
  chmodSafe(dir, PRIVATE_DIR_MODE);
  return dir;
}

export function enforcePrivateFile(file) {
  if (fs.existsSync(file)) chmodSafe(file, PRIVATE_FILE_MODE);
}

export function atomicWriteFile(file, content, options = {}) {
  const mode = options.mode ?? PRIVATE_FILE_MODE;
  ensurePrivateDir(path.dirname(file));
  const temp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`,
  );
  let fd;
  try {
    fd = fs.openSync(temp, 'wx', mode);
    fs.writeFileSync(fd, content, options.encoding || 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    chmodSafe(temp, mode);
    try {
      fs.renameSync(temp, file);
    } catch (err) {
      if (process.platform !== 'win32' || !['EEXIST', 'EPERM'].includes(err.code)) throw err;
      fs.rmSync(file, { force: true });
      fs.renameSync(temp, file);
    }
    chmodSafe(file, mode);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    fs.rmSync(temp, { force: true });
  }
}

export function atomicWriteJson(file, value) {
  atomicWriteFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function readJsonStrict(file, options = {}) {
  if (!fs.existsSync(file)) {
    if (options.allowMissing !== false) return options.defaultValue;
    throw new Error(`${options.label || file} does not exist`);
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${options.label || file} is invalid JSON: ${err.message}`);
  }
}

export function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace('.', '-');
}

export function backupFile(file, backupDir, label) {
  if (!fs.existsSync(file)) return null;
  ensurePrivateDir(backupDir);
  const backup = path.join(backupDir, `${label}.${timestampForFile()}.bak`);
  fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
  chmodSafe(backup, PRIVATE_FILE_MODE);
  return backup;
}

export function fileMode(file) {
  if (!fs.existsSync(file)) return null;
  return fs.statSync(file).mode & 0o777;
}

export function removeEmptyParents(start, stopAt) {
  let current = start;
  while (current.startsWith(stopAt) && current !== stopAt) {
    try {
      fs.rmdirSync(current);
    } catch {
      break;
    }
    current = path.dirname(current);
  }
}
