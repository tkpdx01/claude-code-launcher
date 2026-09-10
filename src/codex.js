// Codex launch logic — CODEX_HOME + process env, no global pollution

import fs from 'fs';
import path from 'path';
import * as store from './store.js';
import { buildCodexEnv } from './env.js';
import { red, yellow } from './color.js';
import { t } from './i18n.js';
import { spawnCli, superviseCli } from './spawn.js';
import { fixCodexAnalyticsScope } from './codex-config.js';
import { status } from './ui.js';

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

// Codex v0.120+ forbids overriding reserved provider names (openai, ollama, lmstudio).
// Auto-fix old profiles that used [model_providers.openai].
function fixReservedProviderName(codexHome) {
  const configPath = path.join(codexHome, 'config.toml');
  if (!fs.existsSync(configPath)) return;

  let toml = fs.readFileSync(configPath, 'utf-8');
  if (!toml.includes('[model_providers.openai]')) return;

  toml = toml.replace(
    /\[model_providers\.openai\]/g,
    '[model_providers.ccc_openai]',
  );

  // Ensure model_provider points to the renamed section
  if (/^\s*model_provider\s*=\s*"openai"/m.test(toml)) {
    toml = toml.replace(
      /^(\s*model_provider\s*=\s*)"openai"/m,
      '$1"ccc_openai"',
    );
  } else if (!/^\s*model_provider\s*=/m.test(toml)) {
    // No model_provider set — add it before first [section]
    const firstSection = toml.match(/^\s*\[/m);
    if (firstSection && firstSection.index !== undefined) {
      toml = toml.slice(0, firstSection.index)
        + 'model_provider = "ccc_openai"\n'
        + toml.slice(firstSection.index);
    }
  }

  const providerSection = /(\[model_providers\.ccc_openai\][^\[]*)/s;
  toml = toml.replace(providerSection, (section) => {
    let updated = section.replace(
      /^\s*requires_openai_auth\s*=\s*true\s*$/m,
      'env_key = "OPENAI_API_KEY"',
    );
    if (!/^\s*env_key\s*=.*$/m.test(updated)) {
      updated = updated.trimEnd() + '\nenv_key = "OPENAI_API_KEY"\n';
    }
    if (!/^\s*wire_api\s*=.*$/m.test(updated)) {
      updated = updated.trimEnd() + '\nwire_api = "responses"\n';
    }
    return updated;
  });

  fs.writeFileSync(configPath, toml);
  console.log(yellow(t('launch.fix_provider')));
}

export function launchCodex(profileName, dangerouslySkipPermissions = false, extraArgs = []) {
  const codexHome = store.getCodexProfileDir(profileName);

  if (!store.codexProfileExists(profileName)) {
    console.log(red(t('common.not_exist', { name: profileName })));
    process.exit(1);
  }

  // Codex requires CODEX_HOME to be an existing directory
  if (!fs.existsSync(codexHome)) {
    fs.mkdirSync(codexHome, { recursive: true });
  }

  // Preserve the upstream cleanup of obsolete sandbox config.
  store.sanitizeCodexProfileConfig(profileName);

  // Recover profiles generated with model/provider inside [analytics].
  const configPath = path.join(codexHome, 'config.toml');
  if (fs.existsSync(configPath)) {
    const original = fs.readFileSync(configPath, 'utf8');
    const corrected = fixCodexAnalyticsScope(original);
    if (corrected !== original) fs.writeFileSync(configPath, corrected);
  }

  // Auto-fix reserved provider names from old profiles
  fixReservedProviderName(codexHome);

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
