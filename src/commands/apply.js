import { profileChoice, status } from '../ui.js';
import fs from 'fs';
import path from 'path';
import * as store from '../store.js';
import { t } from '../i18n.js';
import { CLAUDE_SETTINGS_PATH, CODEX_HOME_PATH } from '../config.js';
import { readClaudeSettings, mergeClaudeSettings } from '../claude-settings.js';
import { fixCodexAnalyticsScope } from '../codex-config.js';
import { select, confirm } from '../prompt.js';
import { red, yellow } from '../color.js';

export async function applyCommand(args) {
  const all = store.getAllProfiles();
  if (all.length === 0) {
    console.log(yellow(t('common.no_profiles')));
    process.exit(0);
  }

  let profileInfo;

  if (!args[0]) {
    const choices = all.map((p, i) => profileChoice(p, i));
    profileInfo = await select(t('pick.apply'), choices);
  } else {
    profileInfo = store.resolveProfile(args[0]);
    if (!profileInfo) {
      console.log(red(t('common.not_exist', { name: args[0] })));
      process.exit(1);
    }
  }

  const target = profileInfo.type === 'codex' ? '~/.codex/' : '~/.claude/settings.json';
  const ok = await confirm(t('apply.confirm', { name: profileInfo.name, target }), false);
  if (!ok) {
    console.log(yellow(t('common.cancelled')));
    process.exit(0);
  }

  if (profileInfo.type === 'codex') {
    applyCodex(profileInfo.name);
  } else {
    applyClaude(profileInfo.name);
  }
}

function applyClaude(name) {
  const profile = store.readClaudeProfile(name);
  if (!profile) {
    console.log(red(t('apply.failed')));
    process.exit(1);
  }

  if (!profile.apiKey) {
    throw new Error(t('common.apikey_required'));
  }
  const settings = mergeClaudeSettings(readClaudeSettings(), profile, { clearModelOverrides: false });

  const dir = path.dirname(CLAUDE_SETTINGS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');

  status('success', t('apply.done_claude', { name }), t('apply.hint', { cmd: 'claude' }));
}

function applyCodex(name) {
  const profile = store.readCodexProfile(name);
  if (!profile) {
    console.log(red(t('apply.failed')));
    process.exit(1);
  }

  if (!fs.existsSync(CODEX_HOME_PATH)) {
    fs.mkdirSync(CODEX_HOME_PATH, { recursive: true });
  }

  const auth = profile.auth || {};
  fs.writeFileSync(
    path.join(CODEX_HOME_PATH, 'auth.json'),
    JSON.stringify(auth, null, 2) + '\n',
  );

  if (profile.configToml && profile.configToml.trim()) {
    fs.writeFileSync(path.join(CODEX_HOME_PATH, 'config.toml'), fixCodexAnalyticsScope(profile.configToml));
  }

  status('success', t('apply.done_codex', { name }), t('apply.hint', { cmd: 'codex' }));
}
