// Codex launch logic — CODEX_HOME + process env, no global pollution

import fs from 'fs';
import * as store from './store.js';
import { buildCodexEnv } from './env.js';
import { red, yellow } from './color.js';
import { t } from './i18n.js';
import { spawnCli, superviseCli } from './spawn.js';
import { status, fail } from './ui.js';

const CODEX_UNSANDBOXED_FLAG = '--dangerously-bypass-approvals-and-sandbox';

// `-d` must pass -c policy overrides because profile sandbox_mode is stripped.
// Do not also pass --ask-for-approval: Codex clap rejects it with the YOLO flag.
export function buildCodexLaunchArgs(dangerouslySkipPermissions = false, extraArgs = []) {
  const args = [];
  if (dangerouslySkipPermissions) {
    args.push(
      '-c', 'sandbox_mode="danger-full-access"',
      '-c', 'approval_policy="never"',
      CODEX_UNSANDBOXED_FLAG,
      '--sandbox', 'danger-full-access',
    );
  }
  args.push(...extraArgs);
  return args;
}

export function launchCodex(profileName, dangerouslySkipPermissions = false, extraArgs = []) {
  if (!store.codexProfileExists(profileName)) fail(t('common.not_exist', { name: profileName }));

  store.materializeJsonCodexProfile(profileName);

  // Codex requires CODEX_HOME to be an existing directory
  const codexHome = store.getCodexProfileDir(profileName);
  fs.mkdirSync(codexHome, { recursive: true });

  // Sandbox cleanup, [analytics] scope repair, and reserved provider rename in one pass.
  if (store.repairCodexProfileConfig(profileName).renamedProvider) {
    console.log(yellow(t('launch.fix_provider')));
  }

  const { apiKey } = store.getCodexCredentials(profileName);
  const env = buildCodexEnv(codexHome, apiKey);

  const args = buildCodexLaunchArgs(dangerouslySkipPermissions, extraArgs);
  const detail = [
    dangerouslySkipPermissions ? t('launch.full_access') : '',
    t('launch.cmd_codex', { home: codexHome, args: args.join(' ') }),
  ].filter(Boolean).join('\n    ');
  status('launch', t('launch.codex', { name: profileName }), detail);

  const child = spawnCli('codex', args, {
    stdio: 'inherit',
    env,
  });

  superviseCli(child, {
    onError: (err) => console.log(red(t('launch.failed', { msg: err.message }))),
  });
}
