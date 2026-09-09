// Claude Code launch logic — runtime merge, temp file, zero global pollution

import fs from 'fs';
import os from 'os';
import path from 'path';
import { TMP_DIR } from './config.js';
import { readClaudeSettings, mergeClaudeSettings } from './claude-settings.js';
import { buildClaudeEnv } from './env.js';
import * as store from './store.js';
import { red } from './color.js';
import { t } from './i18n.js';
import { spawnCli, superviseCli } from './spawn.js';
import { status } from './ui.js';

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
  fs.mkdirSync(TMP_DIR, { recursive: true, mode: 0o700 });
  const dir = fs.mkdtempSync(path.join(TMP_DIR, 'claude-'));
  const tmpPath = path.join(dir, `${profileName}.json`);
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 });
    return { tmpPath, cleanup };
  } catch (err) {
    cleanup();
    throw err;
  }
}

export function launchClaude(profileName, dangerouslySkipPermissions = false, extraArgs = []) {
  const profile = store.readClaudeProfile(profileName);
  if (!profile) {
    console.log(red(t('common.not_exist', { name: profileName })));
    process.exit(1);
  }
  if (!profile.apiKey) {
    console.log(red(t('common.apikey_required')));
    console.log(red(`  → ccc edit ${profileName}`));
    process.exit(1);
  }

  const isDeepseek = profile.type === 'deepseek';

  // Read main config (read-only).
  const main = readClaudeSettings();

  // Merge profile overrides and credentials into a new settings object.
  const merged = mergeClaudeSettings(main, profile);

  // Runtime ccline detection — only if user hasn't set statusLine.
  if (!merged.statusLine) {
    const ccline = detectCcline();
    if (ccline) merged.statusLine = ccline;
  }

  // Disable attribution.
  if (!merged.attribution || typeof merged.attribution !== 'object') {
    merged.attribution = { commit: '', pr: '' };
  }
  merged.includeCoAuthoredBy = false;

  // Write private settings for this launch only.
  const { tmpPath, cleanup } = writeTempSettings(profileName, merged);

  // Credentials also go through the process environment for priority.
  const childEnv = buildClaudeEnv(profile);

  const args = ['--settings', tmpPath];
  if (dangerouslySkipPermissions) args.push('--dangerously-skip-permissions');
  args.push(...extraArgs);

  const launchKey = isDeepseek ? 'launch.deepseek' : 'launch.claude';
  status('launch', t(launchKey, { name: profileName }), t('launch.cmd_claude', { args: args.join(' ') }));

  try {
    const child = spawnCli('claude', args, { stdio: 'inherit', env: childEnv });
    superviseCli(child, {
      cleanup,
      onError: (err) => console.log(red(t('launch.failed', { msg: err.message }))),
    });
  } catch (err) {
    cleanup();
    throw err;
  }
}
