import * as store from '../store.js';
import { t } from '../i18n.js';
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
  if (!n) return t('new.name_empty');
  if (RESERVED.has(n)) return t('new.name_reserved');
  if (n.includes('..') || n.includes('/') || n.includes('\\')) return t('new.name_invalid');
  if (!/^[a-zA-Z0-9_\-. ]+$/.test(n)) return t('new.name_invalid');
  if (n.length > 64) return t('new.name_long');
  return true;
}

export async function newCommand(args) {
  let name = args[0] || '';

  const profileType = await select(t('common.profile_type'), [
    { name: `${magenta('[Claude]')} Claude Code`, value: 'claude' },
    { name: `${blue('[Codex]')}  OpenAI Codex`, value: 'codex' },
  ]);

  if (!name) {
    name = await input(t('common.profile_name'));
  }
  const v = validateName(name);
  if (v !== true) {
    console.log(red(v));
    process.exit(1);
  }

  const existing = store.anyProfileExists(name);
  if (existing.exists) {
    const typeLabel = existing.type === 'codex' ? 'Codex' : 'Claude';
    const overwrite = await confirm(t('new.exists', { name, type: typeLabel }), false);
    if (!overwrite) {
      console.log(yellow(t('common.cancelled')));
      process.exit(0);
    }
    if (existing.type !== profileType) {
      if (existing.type === 'codex') store.deleteCodexProfile(name);
      else store.deleteClaudeProfile(name);
    }
  }

  if (profileType === 'codex') {
    const baseUrl = await input('Base URL:', 'https://api.openai.com/v1');
    const apiKey = await input('OPENAI_API_KEY:');
    const finalName = await input(t('common.profile_name'), name);
    const model = await promptCodexModel(baseUrl, apiKey, '');

    if (finalName !== name) {
      const check = store.anyProfileExists(finalName);
      if (check.exists) {
        const ow = await confirm(t('new.exists', { name: finalName, type: 'Codex' }), false);
        if (!ow) { console.log(yellow(t('common.cancelled'))); process.exit(0); }
      }
    }

    store.ensureDirs();
    store.createCodexProfile(finalName, apiKey, baseUrl, model);
    console.log(green(`\n${t('new.created_codex', { name: finalName })}`));

    if (await confirm(t('new.launch_codex'), false)) {
      launchCodex(finalName);
    }
  } else {
    const apiUrl = await input('ANTHROPIC_BASE_URL:', 'https://api.anthropic.com');
    const apiKey = await input('ANTHROPIC_AUTH_TOKEN:');
    const finalName = await input(t('common.profile_name'), name);

    if (finalName !== name) {
      const check = store.anyProfileExists(finalName);
      if (check.exists) {
        const ow = await confirm(t('new.exists', { name: finalName, type: 'Claude' }), false);
        if (!ow) { console.log(yellow(t('common.cancelled'))); process.exit(0); }
      }
    }

    store.ensureDirs();
    store.saveClaudeProfile(finalName, { apiUrl, apiKey });
    console.log(green(`\n${t('new.created_claude', { name: finalName })}`));

    if (await confirm(t('new.launch_claude'), false)) {
      launchClaude(finalName);
    }
  }
}
