import fs from 'fs';
import path from 'path';
import * as store from '../store.js';
import { t } from '../i18n.js';
import { CLAUDE_SETTINGS_PATH, CODEX_HOME_PATH } from '../config.js';
import { readClaudeSettings, mergeClaudeSettings } from '../claude-settings.js';
import { fixCodexAnalyticsScope } from '../codex-config.js';
import { confirm } from '../prompt.js';
import { status, fail } from '../ui.js';
import { selectProfile, cancel } from './shared.js';

export async function applyCommand(args) {
  const profileInfo = await selectProfile(args, 'pick.apply');

  const target = profileInfo.type === 'codex' ? '~/.codex/' : '~/.claude/settings.json';
  const ok = await confirm(t('apply.confirm', { name: profileInfo.name, target }), false);
  if (!ok) cancel();

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

  fs.mkdirSync(path.dirname(CLAUDE_SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');

  status('success', t('apply.done_claude', { name }), t('apply.hint', { cmd: 'claude' }));
}

function applyCodex(name) {
  const profile = store.readCodexProfile(name);
  if (!profile) fail(t('apply.failed'));

  fs.mkdirSync(CODEX_HOME_PATH, { recursive: true });

  const auth = profile.auth || {};
  fs.writeFileSync(
    path.join(CODEX_HOME_PATH, 'auth.json'),
    JSON.stringify(auth, null, 2) + '\n',
  );

  if (profile.configToml && profile.configToml.trim()) {
    fs.writeFileSync(path.join(CODEX_HOME_PATH, 'config.toml'), fixCodexAnalyticsScope(profile.configToml));
    store.copyCodexProfileSupportFiles(name, CODEX_HOME_PATH);
  }

  status('success', t('apply.done_codex', { name }), t('apply.hint', { cmd: 'codex' }));
}
