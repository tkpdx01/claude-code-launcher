// Codex launch logic — CODEX_HOME + process env, no global pollution

import fs from 'fs';
import { spawn } from 'child_process';
import * as store from './store.js';
import { buildCodexEnv } from './env.js';
import { green, gray, red } from './color.js';

export function launchCodex(profileName, dangerouslySkipPermissions = false) {
  const codexHome = store.getCodexProfileDir(profileName);

  if (!store.codexProfileExists(profileName)) {
    console.log(red(`Profile "${profileName}" does not exist`));
    process.exit(1);
  }

  // Codex requires CODEX_HOME to be an existing directory
  if (!fs.existsSync(codexHome)) {
    fs.mkdirSync(codexHome, { recursive: true });
  }

  const { apiKey } = store.getCodexCredentials(profileName);
  const env = buildCodexEnv(codexHome, apiKey);

  const args = [];
  if (dangerouslySkipPermissions) args.push('--full-auto');

  console.log(green(`Launch Codex with profile: ${profileName}`));
  console.log(gray(`CODEX_HOME=${codexHome} codex ${args.join(' ')}`));

  const child = spawn('codex', args, {
    stdio: 'inherit',
    shell: true,
    env,
  });

  child.on('error', (err) => {
    console.log(red(`Launch failed: ${err.message}`));
    process.exit(1);
  });
}
