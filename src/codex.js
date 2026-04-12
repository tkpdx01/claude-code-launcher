// Codex launch logic — CODEX_HOME + process env, no global pollution

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import * as store from './store.js';
import { buildCodexEnv } from './env.js';
import { green, gray, red, yellow } from './color.js';
import { t } from './i18n.js';

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

  // Ensure wire_api and requires_openai_auth exist in the section
  if (!/wire_api/.test(toml)) {
    toml = toml.replace(
      /(\[model_providers\.ccc_openai\][^\[]*)/s,
      (section) => section.trimEnd() + '\nwire_api = "responses"\nrequires_openai_auth = true\n',
    );
  }

  fs.writeFileSync(configPath, toml);
  console.log(yellow(t('launch.fix_provider')));
}

export function launchCodex(profileName, dangerouslySkipPermissions = false) {
  const codexHome = store.getCodexProfileDir(profileName);

  if (!store.codexProfileExists(profileName)) {
    console.log(red(t('common.not_exist', { name: profileName })));
    process.exit(1);
  }

  // Codex requires CODEX_HOME to be an existing directory
  if (!fs.existsSync(codexHome)) {
    fs.mkdirSync(codexHome, { recursive: true });
  }

  // Auto-fix reserved provider names from old profiles
  fixReservedProviderName(codexHome);

  const { apiKey } = store.getCodexCredentials(profileName);
  const env = buildCodexEnv(codexHome, apiKey);

  const args = [];
  if (dangerouslySkipPermissions) args.push('--full-auto');

  console.log(green(t('launch.codex', { name: profileName })));
  console.log(gray(t('launch.cmd_codex', { home: codexHome, args: args.join(' ') })));

  const child = spawn('codex', args, {
    stdio: 'inherit',
    env,
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
