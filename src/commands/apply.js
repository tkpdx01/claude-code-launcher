import fs from 'fs';
import path from 'path';
import * as store from '../store.js';
import { t } from '../i18n.js';
import { CLAUDE_SETTINGS_PATH, CODEX_HOME_PATH } from '../config.js';
import { readClaudeSettings, mergeClaudeSettings } from '../claude-settings.js';
import { mergeCodexConfig } from '../codex-config.js';
import { writeWithBackup } from '../recovery.js';
import { tomlText, setTomlValue } from '../toml.js';
import { confirm } from '../prompt.js';
import { status, fail } from '../ui.js';
import { selectProfile, cancel } from './shared.js';

export async function applyCommand(args) {
  const profileInfo = await selectProfile(args, 'pick.apply');

  const target = profileInfo.type === 'codex' ? '~/.codex/' : '~/.claude/settings.json';
  const ok = await confirm(t('apply.confirm', { name: profileInfo.name, target }), false);
  if (!ok) return cancel();

  if (profileInfo.type === 'codex') {
    applyCodex(profileInfo.name);
  } else {
    applyClaude(profileInfo.name);
  }
}

function applyClaude(name) {
  const profile = store.readClaudeProfile(name);
  if (!profile) fail(t('apply.failed'));

  if (!profile.apiKey) {
    throw new Error(t('common.apikey_required'));
  }
  const settings = mergeClaudeSettings(readClaudeSettings(), profile, { clearModelOverrides: false });

  const id = writeWithBackup([{ file: CLAUDE_SETTINGS_PATH, data: JSON.stringify(settings, null, 2) + '\n' }]);

  status('success', t('apply.done_claude', { name }), t('apply.hint', { cmd: 'claude' }));
  status('success', t('recovery.saved', { id }));
}

function applyCodex(name) {
  const profile = store.readCodexProfile(name);
  if (!profile) fail(t('apply.failed'));

  const configPath = path.join(CODEX_HOME_PATH, 'config.toml');
  let current = '';
  try { current = fs.readFileSync(configPath, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  let config = mergeCodexConfig(current, profile.configToml);
  const changes = [];
  const catalog = tomlText(config, ['model_catalog_json']);
  if (catalog) {
    const filename = path.basename(catalog.replace(/\\/g, '/'));
    if (!/^model-catalog[A-Za-z0-9_.-]*\.json$/.test(filename)) throw new Error('Unsupported model catalog filename');
    const source = path.isAbsolute(catalog) ? catalog : path.join(store.getCodexProfileDir(name), catalog.replace(/\\/g, '/'));
    const destination = path.join(CODEX_HOME_PATH, filename);
    changes.push({ file: destination, data: fs.readFileSync(source) });
    config = setTomlValue(config, ['model_catalog_json'], JSON.stringify(destination));
  }
  changes.push({ file: configPath, data: config });
  changes.push({ file: path.join(CODEX_HOME_PATH, 'auth.json'), data: JSON.stringify(profile.auth, null, 2) + '\n' });
  const id = writeWithBackup(changes);

  status('success', t('apply.done_codex', { name }), t('apply.hint', { cmd: 'codex' }));
  status('success', t('recovery.saved', { id }));
}
