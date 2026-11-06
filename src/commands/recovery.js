import * as store from '../store.js';
import { archiveProfiles, listRecovery, readRecovery, restoreRecovery } from '../recovery.js';
import { confirm, select } from '../prompt.js';
import { t } from '../i18n.js';
import { status } from '../ui.js';
import { cancel } from './shared.js';

export async function cleanupCommand(args) {
  const keep = [];
  let keeping = false;
  let apply = false;
  let dryRun = false;
  let yes = false;
  for (const arg of args) {
    if (arg === '--keep') keeping = true;
    else if (['--apply', '--dry-run', '--yes'].includes(arg)) {
      keeping = false;
      if (arg === '--apply') apply = true;
      if (arg === '--dry-run') dryRun = true;
      if (arg === '--yes') yes = true;
    } else if (keeping && !arg.startsWith('--')) keep.push(...arg.split(',').filter(Boolean));
    else throw new Error(t('cleanup.usage'));
  }
  if (!keep.length || (apply && dryRun)) throw new Error(t('cleanup.usage'));
  const all = store.getAllProfiles();
  for (const name of keep) {
    if (!all.some((p) => p.name === name)) throw new Error(t('common.not_exist', { name }));
  }
  const selected = all.filter((p) => !keep.includes(p.name));
  if (!selected.length) { status('success', t('cleanup.empty')); return; }
  console.log(selected.map((p) => `  ${p.name} (${p.type})`).join('\n'));
  if (!apply) { status('success', t('cleanup.preview', { count: selected.length })); return; }
  if (!yes && !await confirm(t('cleanup.confirm', { count: selected.length }), false)) return cancel();
  const id = archiveProfiles(store.profilePaths(selected), selected.map((p) => p.name));
  status('success', t('recovery.saved', { id }));
}

export async function restoreCommand(args) {
  const ids = args.filter((arg) => !['--yes', '--dry-run'].includes(arg));
  if (ids.length > 1) throw new Error('Usage: ccc restore [id] [--dry-run] [--yes]');
  let id = ids[0];
  if (!id) {
    const records = listRecovery();
    if (!records.length) { status('success', t('recovery.empty')); return; }
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      for (const record of records) console.log(`${record.id}  ${record.names?.join(', ') || record.entries.map((e) => e.target).join(', ')}`);
      return;
    }
    id = await select(t('recovery.select'), records.map((r) => ({
      name: r.id, description: r.names?.join(', ') || r.entries.map((e) => e.target).join(', '), value: r.id,
    })));
  }
  const { manifest } = readRecovery(id);
  for (const entry of manifest.entries) console.log(`  ~/${entry.target}`);
  if (args.includes('--dry-run')) return;
  if (!args.includes('--yes') && !await confirm(t('recovery.confirm'), false)) return cancel();
  restoreRecovery(id);
  status('success', t('recovery.restored'));
}
