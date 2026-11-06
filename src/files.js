// Private, atomic writes shared by profiles, preferences, and recovery files.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function privateDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') fs.chmodSync(dir, 0o700);
}

export function exists(file) {
  try { fs.lstatSync(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export function atomicWrite(file, data) {
  privateDir(path.dirname(file));
  // Preserve intentional links, including a shared global settings file.
  if (exists(file) && fs.lstatSync(file).isSymbolicLink()) file = fs.realpathSync(file);
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temp, 'wx', 0o600);
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temp, file);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    fs.rmSync(temp, { force: true });
  }
}

export function atomicWriteBatch(changes) {
  const originals = changes.map(({ file }) => exists(file) ? fs.readFileSync(file) : null);
  const written = [];
  try {
    changes.forEach(({ file, data }, i) => { atomicWrite(file, data); written.push(i); });
  } catch (error) {
    for (const i of written.reverse()) {
      if (originals[i] === null) fs.rmSync(changes[i].file, { force: true });
      else atomicWrite(changes[i].file, originals[i]);
    }
    throw error;
  }
}
