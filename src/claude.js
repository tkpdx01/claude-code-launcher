// Claude Code launch logic — runtime merge, temp file, zero global pollution

import fs from 'fs';
import os from 'os';
import path from 'path';
import { CLAUDE_SETTINGS_PATH, TMP_DIR } from './config.js';
import { buildClaudeEnv, isModelOverrideKey } from './env.js';
import * as store from './store.js';
import { green, gray, red } from './color.js';
import { t } from './i18n.js';
import { spawnCli } from './spawn.js';

// Read ~/.claude/settings.json (read-only, never write)
function readMainSettings() {
  if (!fs.existsSync(CLAUDE_SETTINGS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

// Simple deep merge (target gets overwritten by source for overlapping keys)
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (
      sv && typeof sv === 'object' && !Array.isArray(sv) &&
      tv && typeof tv === 'object' && !Array.isArray(tv)
    ) {
      deepMerge(tv, sv);
    } else {
      target[key] = sv;
    }
  }
  return target;
}

// Detect ccline at runtime — only set if binary exists
function detectCcline() {
  const platform = os.platform();
  const cclinePath = platform === 'win32'
    ? path.join(os.homedir(), '.claude', 'ccline', 'ccline.exe')
    : path.join(os.homedir(), '.claude', 'ccline', 'ccline');

  // Use expandable path for the command (~ works in Claude Code's shell execution)
  const command = platform === 'win32'
    ? '%USERPROFILE%\\.claude\\ccline\\ccline.exe'
    : '~/.claude/ccline/ccline';

  if (fs.existsSync(cclinePath)) {
    return { type: 'command', command, padding: 0 };
  }
  return null;
}

// Write merged settings to a temp file under ~/.ccc/tmp/
function writeTempSettings(profileName, settings) {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  const tmpPath = path.join(TMP_DIR, `${profileName}.json`);
  fs.writeFileSync(tmpPath, JSON.stringify(settings, null, 2) + '\n');
  return tmpPath;
}

export function launchClaude(profileName, dangerouslySkipPermissions = false) {
  const profile = store.readClaudeProfile(profileName);
  if (!profile) {
    console.log(red(t('common.not_exist', { name: profileName })));
    process.exit(1);
  }

  // 1. Read main config (read-only)
  const main = readMainSettings();

  // 2. Deep merge profile.settings overrides into main config copy
  const merged = deepMerge(structuredClone(main), profile.settings || {});

  // 3. Inject required env into merged settings
  merged.env = merged.env || {};
  if (profile.apiKey) merged.env.ANTHROPIC_AUTH_TOKEN = profile.apiKey;
  if (profile.apiUrl) merged.env.ANTHROPIC_BASE_URL = profile.apiUrl;

  // Disable telemetry (granular, avoids blocking GrowthBook feature flags)
  merged.env.DISABLE_TELEMETRY = '1';
  merged.env.DISABLE_ERROR_REPORTING = '1';
  merged.env.DISABLE_AUTOUPDATER = '1';
  merged.env.DISABLE_BUG_COMMAND = '1';

  // Inject extra env from profile
  if (profile.env && typeof profile.env === 'object') {
    for (const [key, value] of Object.entries(profile.env)) {
      merged.env[key] = value;
    }
  }

  // Set model override env vars to empty in merged settings — this ensures
  // they take priority over user settings source and force Claude Code
  // to use its built-in default model for this endpoint.
  // Skip keys explicitly set in profile.env (user wants those).
  const profileEnvKeys = new Set(Object.keys(profile.env || {}));
  for (const key of Object.keys(merged.env)) {
    if (isModelOverrideKey(key) && !profileEnvKeys.has(key)) merged.env[key] = '';
  }

  // Strip inherited model from main config — different endpoints support different
  // models, inheriting the main config's model almost always causes errors.
  // Users can explicitly set model via profile.settings.model if needed.
  if (!profile.settings?.model) {
    delete merged.model;
  }

  // 4. Runtime ccline detection — only if user hasn't set statusLine
  if (!merged.statusLine) {
    const ccline = detectCcline();
    if (ccline) merged.statusLine = ccline;
  }

  // 5. Skip onboarding
  merged.hasCompletedOnboarding = true;

  // 6. Disable attribution
  if (!merged.attribution || typeof merged.attribution !== 'object') {
    merged.attribution = { commit: '', pr: '' };
  }
  merged.includeCoAuthoredBy = false;

  // 7. Write temp settings file
  const tmpPath = writeTempSettings(profileName, merged);

  // 8. Build child process env (credentials also injected via process env for priority)
  const childEnv = buildClaudeEnv(profile);

  // 9. Spawn
  const args = ['--settings', tmpPath];
  if (dangerouslySkipPermissions) args.push('--dangerously-skip-permissions');

  console.log(green(t('launch.claude', { name: profileName })));
  console.log(gray(t('launch.cmd_claude', { args: args.join(' ') })));

  const child = spawnCli('claude', args, {
    stdio: 'inherit',
    env: childEnv,
  });

  child.on('close', (code) => process.exit(code ?? 0));
  child.on('error', (err) => {
    console.log(red(t('launch.failed', { msg: err.message })));
    process.exit(1);
  });
  for (const sig of ['SIGTERM', 'SIGHUP']) {
    process.on(sig, () => child.kill(sig));
  }
}
