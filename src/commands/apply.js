import fs from 'fs';
import path from 'path';
import * as store from '../store.js';
import { CLAUDE_SETTINGS_PATH, CODEX_HOME_PATH } from '../config.js';
import { isModelOverrideKey } from '../env.js';
import { select, confirm } from '../prompt.js';
import { cyan, green, gray, red, yellow, blue, magenta } from '../color.js';

export async function applyCommand(args) {
  const all = store.getAllProfiles();
  if (all.length === 0) {
    console.log(yellow('No profiles available'));
    process.exit(0);
  }

  let profileInfo;

  if (!args[0]) {
    const choices = all.map((p) => {
      const tag = p.type === 'codex' ? blue('[Codex]') : magenta('[Claude]');
      return { name: `${tag} ${p.name}`, value: p };
    });
    profileInfo = await select('Select profile to apply:', choices);
  } else {
    profileInfo = store.resolveProfile(args[0]);
    if (!profileInfo) {
      console.log(red(`Profile "${args[0]}" does not exist`));
      process.exit(1);
    }
  }

  const target = profileInfo.type === 'codex' ? '~/.codex/' : '~/.claude/settings.json';
  const ok = await confirm(`Apply "${profileInfo.name}" credentials to ${target}?`, false);
  if (!ok) {
    console.log(yellow('Cancelled'));
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
    console.log(red('Failed to read profile'));
    process.exit(1);
  }

  // Read existing settings (or start empty)
  let settings = {};
  if (fs.existsSync(CLAUDE_SETTINGS_PATH)) {
    try {
      settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    } catch { /* start fresh */ }
  }

  settings.env = settings.env || {};

  // Inject credentials
  if (profile.apiKey) settings.env.ANTHROPIC_AUTH_TOKEN = profile.apiKey;
  if (profile.apiUrl) settings.env.ANTHROPIC_BASE_URL = profile.apiUrl;

  // Telemetry
  settings.env.DISABLE_TELEMETRY = '1';
  settings.env.DISABLE_ERROR_REPORTING = '1';
  settings.env.DISABLE_AUTOUPDATER = '1';
  settings.env.DISABLE_BUG_COMMAND = '1';

  // Inject profile extra env
  if (profile.env && typeof profile.env === 'object') {
    for (const [key, value] of Object.entries(profile.env)) {
      settings.env[key] = value;
    }
  }

  // Clear model overrides not in profile (different endpoints = different models)
  const profileEnvKeys = new Set(Object.keys(profile.env || {}));
  for (const key of Object.keys(settings.env)) {
    if (isModelOverrideKey(key) && !profileEnvKeys.has(key)) {
      delete settings.env[key];
    }
  }

  // Clear model field unless profile explicitly sets one
  if (!profile.settings?.model) {
    delete settings.model;
  } else {
    settings.model = profile.settings.model;
  }

  // Apply profile settings overrides
  if (profile.settings && typeof profile.settings === 'object') {
    for (const [key, value] of Object.entries(profile.settings)) {
      settings[key] = value;
    }
  }

  settings.hasCompletedOnboarding = true;

  // Write
  const dir = path.dirname(CLAUDE_SETTINGS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');

  console.log(green(`Applied "${name}" to ~/.claude/settings.json`));
  console.log(gray('  You can now run `claude` directly.'));
}

function applyCodex(name) {
  const profile = store.readCodexProfile(name);
  if (!profile) {
    console.log(red('Failed to read profile'));
    process.exit(1);
  }

  if (!fs.existsSync(CODEX_HOME_PATH)) {
    fs.mkdirSync(CODEX_HOME_PATH, { recursive: true });
  }

  // Write auth.json
  const auth = profile.auth || {};
  fs.writeFileSync(
    path.join(CODEX_HOME_PATH, 'auth.json'),
    JSON.stringify(auth, null, 2) + '\n',
  );

  // Write config.toml
  if (profile.configToml && profile.configToml.trim()) {
    fs.writeFileSync(path.join(CODEX_HOME_PATH, 'config.toml'), profile.configToml);
  }

  console.log(green(`Applied "${name}" to ~/.codex/`));
  console.log(gray('  You can now run `codex` directly.'));
}
