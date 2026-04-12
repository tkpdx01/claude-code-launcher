import * as store from '../store.js';
import { input, confirm, select } from '../prompt.js';
import { promptCodexModel } from '../models.js';
import { green, red, yellow, blue, magenta } from '../color.js';
import { launchClaude } from '../claude.js';
import { launchCodex } from '../codex.js';

const RESERVED = new Set([
  'list', 'ls', 'use', 'show', 'new', 'edit', 'delete', 'rm', 'apply', 'help',
]);

function validateName(name) {
  const n = name.trim();
  if (!n) return 'Name cannot be empty';
  if (RESERVED.has(n)) return 'Name conflicts with a command keyword';
  if (n.includes('..') || n.includes('/') || n.includes('\\')) return 'Name contains invalid characters';
  if (!/^[a-zA-Z0-9_\-. ]+$/.test(n)) return 'Name contains invalid characters';
  if (n.length > 64) return 'Name too long (max 64)';
  return true;
}

export async function newCommand(args) {
  let name = args[0] || '';

  // Choose type
  const profileType = await select('Profile type:', [
    { name: `${magenta('[Claude]')} Claude Code`, value: 'claude' },
    { name: `${blue('[Codex]')}  OpenAI Codex`, value: 'codex' },
  ]);

  // Get name
  if (!name) {
    name = await input('Profile name:');
  }
  const v = validateName(name);
  if (v !== true) {
    console.log(red(v));
    process.exit(1);
  }

  // Check existing (cross-type: delete old type if overwriting)
  const existing = store.anyProfileExists(name);
  if (existing.exists) {
    const typeLabel = existing.type === 'codex' ? 'Codex' : 'Claude';
    const overwrite = await confirm(`Profile "${name}" already exists (${typeLabel}), overwrite?`, false);
    if (!overwrite) {
      console.log(yellow('Cancelled'));
      process.exit(0);
    }
    // Remove old profile if switching type
    if (existing.type !== profileType) {
      if (existing.type === 'codex') store.deleteCodexProfile(name);
      else store.deleteClaudeProfile(name);
    }
  }

  if (profileType === 'codex') {
    const baseUrl = await input('Base URL:', 'https://api.openai.com/v1');
    const apiKey = await input('OPENAI_API_KEY:');
    const finalName = await input('Profile name:', name);
    const model = await promptCodexModel(baseUrl, apiKey, '');

    if (finalName !== name) {
      const check = store.anyProfileExists(finalName);
      if (check.exists) {
        const ow = await confirm(`Profile "${finalName}" already exists, overwrite?`, false);
        if (!ow) { console.log(yellow('Cancelled')); process.exit(0); }
      }
    }

    store.ensureDirs();
    store.createCodexProfile(finalName, apiKey, baseUrl, model);
    console.log(green(`\nCreated Codex profile "${finalName}"`));

    if (store.getAllProfiles().length === 1) {
      store.setDefault(finalName);
      console.log(green('Set as default'));
    }

    if (await confirm('Launch Codex now?', false)) {
      launchCodex(finalName);
    }
  } else {
    const apiUrl = await input('ANTHROPIC_BASE_URL:', 'https://api.anthropic.com');
    const apiKey = await input('ANTHROPIC_AUTH_TOKEN:');
    const finalName = await input('Profile name:', name);

    if (finalName !== name) {
      const check = store.anyProfileExists(finalName);
      if (check.exists) {
        const ow = await confirm(`Profile "${finalName}" already exists, overwrite?`, false);
        if (!ow) { console.log(yellow('Cancelled')); process.exit(0); }
      }
    }

    store.ensureDirs();
    store.saveClaudeProfile(finalName, { apiUrl, apiKey });
    console.log(green(`\nCreated Claude profile "${finalName}"`));

    if (store.getAllProfiles().length === 1) {
      store.setDefault(finalName);
      console.log(green('Set as default'));
    }

    if (await confirm('Launch Claude now?', false)) {
      launchClaude(finalName);
    }
  }
}
