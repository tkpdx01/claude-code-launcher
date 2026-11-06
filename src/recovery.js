import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { HOME, CONFIG_DIR } from './config.js';
import { atomicWrite, privateDir, exists } from './files.js';

const recoveryDir = path.join(CONFIG_DIR, 'recovery');
const hash = (data) => data === null ? null : createHash('sha256').update(data).digest('hex');
const read = (file) => exists(file) ? fs.readFileSync(file) : null;
const relative = (file) => path.relative(HOME, file).split(path.sep).join('/');
const saveManifest = (dir, manifest) => atomicWrite(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

function targetPath(target, kind) {
  const pattern = kind === 'cleanup'
    ? /^\.ccc\/(?:profiles\/[A-Za-z0-9_. -]+\.json|codex-profiles\/[A-Za-z0-9_. -]+)$/
    : /^(?:\.claude\/settings\.json|\.codex\/(?:auth\.json|config\.toml|model-catalog[A-Za-z0-9_.-]*\.json))$/;
  if (!pattern.test(target) || target.includes('..')) throw new Error('Invalid recovery target');
  return path.join(HOME, ...target.split('/'));
}

function createRecord(kind, entries) {
  privateDir(CONFIG_DIR);
  privateDir(recoveryDir);
  const id = `${kind}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const dir = path.join(recoveryDir, id);
  privateDir(dir);
  return { dir, manifest: { id, kind, created: new Date().toISOString(), entries } };
}

function put(file, data) {
  if (data === null) fs.rmSync(file, { force: true });
  else atomicWrite(file, data);
}

// Each file is replaced atomically; a failed multi-file write rolls back.
// The on-disk snapshot also survives interruption of the process.
export function writeWithBackup(changes) {
  const originals = changes.map(({ file }) => read(file));
  const entries = changes.map(({ file, data }, i) => {
    const target = relative(file);
    targetPath(target, 'apply');
    return { target, saved: String(i), existed: originals[i] !== null, after: hash(data) };
  });
  const { dir, manifest } = createRecord('apply', entries);
  originals.forEach((data, i) => { if (data !== null) atomicWrite(path.join(dir, String(i)), data); });
  saveManifest(dir, manifest);
  const completed = [];
  try {
    changes.forEach(({ file, data }, i) => { put(file, data); completed.push(i); });
  } catch (error) {
    for (const i of completed.reverse()) put(changes[i].file, originals[i]);
    throw error;
  }
  return manifest.id;
}

export function archiveProfiles(files, names) {
  const entries = files.map((file, i) => {
    const target = relative(file);
    targetPath(target, 'cleanup');
    if (!exists(file)) throw new Error(`Profile no longer exists: ${target}`);
    return { target, saved: String(i) };
  });
  const { dir, manifest } = createRecord('cleanup', entries);
  const defaultFile = path.join(CONFIG_DIR, 'default');
  const previousDefault = read(defaultFile);
  manifest.default = previousDefault?.toString().trim() || '';
  manifest.names = names;
  saveManifest(dir, manifest);
  const completed = [];
  try {
    entries.forEach((entry, i) => {
      fs.renameSync(files[i], path.join(dir, entry.saved));
      completed.push(i);
    });
    if (names.includes(manifest.default)) atomicWrite(defaultFile, '');
  } catch (error) {
    for (const i of completed.reverse()) fs.renameSync(path.join(dir, entries[i].saved), files[i]);
    throw error;
  }
  return manifest.id;
}

export function readRecovery(id) {
  if (!/^(apply|cleanup)-\d+-[a-f0-9]{8}$/.test(id)) throw new Error('Invalid recovery ID');
  const dir = path.join(recoveryDir, id);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  if (manifest.id !== id || !['apply', 'cleanup'].includes(manifest.kind) || !Array.isArray(manifest.entries)) {
    throw new Error('Invalid recovery record');
  }
  const targets = new Set();
  for (const entry of manifest.entries) {
    targetPath(entry.target, manifest.kind);
    if (!/^\d+$/.test(entry.saved) || targets.has(entry.target)) throw new Error('Invalid recovery entry');
    targets.add(entry.target);
  }
  return { dir, manifest };
}

export function listRecovery() {
  if (!exists(recoveryDir)) return [];
  return fs.readdirSync(recoveryDir).flatMap((id) => {
    try {
      const { manifest } = readRecovery(id);
      return manifest.restored ? [] : [manifest];
    } catch { return []; }
  }).sort((a, b) => b.created.localeCompare(a.created));
}

export function restoreRecovery(id) {
  const { dir, manifest } = readRecovery(id);
  if (manifest.restored) throw new Error('This record has already been restored');
  const targets = manifest.entries.map((entry) => targetPath(entry.target, manifest.kind));
  if (manifest.kind === 'apply') {
    const changes = manifest.entries.map((entry, i) => {
      const current = read(targets[i]);
      const original = entry.existed ? fs.readFileSync(path.join(dir, entry.saved)) : null;
      // Permit interrupted/rolled-back apply operations, but never overwrite later edits.
      if (hash(current) !== entry.after && hash(current) !== hash(original)) {
        throw new Error(`Configuration changed since this backup: ${entry.target}`);
      }
      return { file: targets[i], data: original };
    });
    writeWithBackup(changes);
  } else {
    manifest.entries.forEach((entry, i) => {
      if (exists(targets[i])) throw new Error(`Restore would overwrite ${entry.target}`);
      if (!exists(path.join(dir, entry.saved))) throw new Error('Recovery data is incomplete');
    });
    const completed = [];
    try {
      manifest.entries.forEach((entry, i) => {
        privateDir(path.dirname(targets[i]));
        fs.renameSync(path.join(dir, entry.saved), targets[i]);
        completed.push(i);
      });
      const defaultFile = path.join(CONFIG_DIR, 'default');
      if (manifest.default && !read(defaultFile)?.toString().trim()) atomicWrite(defaultFile, manifest.default + '\n');
    } catch (error) {
      for (const i of completed.reverse()) fs.renameSync(targets[i], path.join(dir, manifest.entries[i].saved));
      throw error;
    }
  }
  manifest.restored = new Date().toISOString();
  saveManifest(dir, manifest);
}
