import fs from 'fs';
import path from 'path';
import * as store from '../store.js';
import { t } from '../i18n.js';
import { CLAUDE_SETTINGS_PATH, CODEX_HOME_PATH } from '../config.js';
import { isModelOverrideKey } from '../env.js';
import { select, confirm } from '../prompt.js';
import { green, gray, red, yellow, blue, magenta } from '../color.js';

export async function applyCommand(args) {
  const all = store.getAllProfiles();
  if (all.length === 0) {
    console.log(yellow(t('common.no_profiles')));
    process.exit(0);
  }

  let profileInfo;

  if (!args[0]) {
    const choices = all.map((p) => {
      const tag = p.type === 'codex' ? blue('[Codex]') : magenta('[Claude]');
      return { name: `${tag} ${p.name}`, value: p };
    });
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

  let settings = {};
  if (fs.existsSync(CLAUDE_SETTINGS_PATH)) {
    try {
      settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    } catch { /* start fresh */ }
  }

  settings.env = settings.env || {};
  if (profile.apiKey) settings.env.ANTHROPIC_AUTH_TOKEN = profile.apiKey;
  if (profile.apiUrl) settings.env.ANTHROPIC_BASE_URL = profile.apiUrl;

  settings.env.DISABLE_TELEMETRY = '1';
  settings.env.DISABLE_ERROR_REPORTING = '1';
  settings.env.DISABLE_AUTOUPDATER = '1';
  settings.env.DISABLE_BUG_COMMAND = '1';

  if (profile.env && typeof profile.env === 'object') {
    for (const [key, value] of Object.entries(profile.env)) {
      settings.env[key] = value;
    }
  }

  const profileEnvKeys = new Set(Object.keys(profile.env || {}));
  for (const key of Object.keys(settings.env)) {
    if (isModelOverrideKey(key) && !profileEnvKeys.has(key)) {
      delete settings.env[key];
    }
  }

  if (!profile.settings?.model) {
    delete settings.model;
  } else {
    settings.model = profile.settings.model;
  }

  if (profile.settings && typeof profile.settings === 'object') {
    for (const [key, value] of Object.entries(profile.settings)) {
      settings[key] = value;
    }
  }

  settings.hasCompletedOnboarding = true;

  const dir = path.dirname(CLAUDE_SETTINGS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');

  console.log(green(t('apply.done_claude', { name })));
  console.log(gray(`  ${t('apply.hint', { cmd: 'claude' })}`));
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
    fs.writeFileSync(path.join(CODEX_HOME_PATH, 'config.toml'), profile.configToml);
    store.copyCodexProfileSupportFiles(name, CODEX_HOME_PATH);
  }

  console.log(green(t('apply.done_codex', { name })));
  console.log(gray(`  ${t('apply.hint', { cmd: 'codex' })}`));
}
