#!/usr/bin/env node

// CCC — Claude Code / Codex Settings Launcher
// Zero external dependencies. Profiles store only credentials.

import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import * as store from './src/store.js';
import { launchClaude } from './src/claude.js';
import { launchCodex } from './src/codex.js';
import { select } from './src/prompt.js';
import { t, getLang, setLang } from './src/i18n.js';
import { yellow } from './src/color.js';
import { brandHeader, profileChoice, status, fail } from './src/ui.js';
import { listCommand } from './src/commands/list.js';
import { newCommand } from './src/commands/new.js';
import { editCommand } from './src/commands/edit.js';
import { deleteCommand } from './src/commands/delete.js';
import { showCommand } from './src/commands/show.js';
import { helpCommand } from './src/commands/help.js';
import { applyCommand } from './src/commands/apply.js';
import { cleanupCommand, restoreCommand } from './src/commands/recovery.js';
import { defaultCommand } from './src/commands/default.js';
import { parseArgs, isDangerous } from './src/args.js';

const { cmd, rest, flags } = parseArgs(process.argv.slice(2));
const ddd = isDangerous(flags);

function readVersion() {
  if (typeof CCC_VERSION !== 'undefined') return CCC_VERSION;
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8')).version;
}

if (flags.has('-v') || flags.has('--version') || flags.has('-V')) {
  console.log(readVersion());
  process.exit(0);
}

if (flags.has('-h') || flags.has('--help') || cmd === 'help') {
  helpCommand();
  process.exit(0);
}

function launchProfile(name, type, d, args = []) {
  if (type === 'codex') launchCodex(name, d, args);
  else launchClaude(name, d, args); // both 'claude' and 'deepseek' use Claude Code
}

async function mainMenu() {
  // Piped stdin belongs to the child only when a profile is explicitly named.
  if (!process.stdin.isTTY || !process.stdout.isTTY) { listCommand(); return; }
  while (true) {
    const all = store.getAllProfiles();
    if (!all.length) { await newCommand([]); return; }
    console.log('\n' + brandHeader(readVersion(), all));
    const defaultName = store.getDefaultProfileName();
    const choices = all.map((p, i) => {
      const choice = profileChoice(p, i);
      if (p.name === defaultName) choice.name += ' ★';
      return choice;
    });
    const shortcuts = Object.fromEntries(Object.entries({
      n: 'new', e: 'edit', a: 'apply', d: 'delete', s: 'show', f: 'default', l: 'lang', r: 'restore',
    }).map(([key, action]) => [key, (profile) => ({ action, profile })]));
    const selected = await select(t('pick.launch'), choices,
      Math.max(0, all.findIndex((p) => p.name === defaultName)),
      { shortcuts, hint: t('ui.profile_keys') });
    if (!selected) return;
    if (!selected.action) { launchProfile(selected.name, selected.type, ddd); return; }
    if (selected.action === 'lang') { setLang(getLang() === 'en' ? 'zh' : 'en'); continue; }
    if (!selected.profile && !['new', 'restore'].includes(selected.action)) continue;
    const launched = await commands[selected.action](selected.action === 'new' || selected.action === 'restore' ? [] : [selected.profile.name]);
    if (launched === true) return;
  }
}

const commands = {
  list: listCommand,
  ls: listCommand,
  new: newCommand,
  edit: editCommand,
  delete: deleteCommand,
  rm: deleteCommand,
  show: showCommand,
  apply: applyCommand,
  cleanup: cleanupCommand,
  restore: restoreCommand,
  default: defaultCommand,
};

async function main() {
  if (cmd && Object.prototype.hasOwnProperty.call(commands, cmd)) {
    await commands[cmd](rest, flags);
  } else if (cmd) {
    const resolved = store.resolveProfile(cmd);
    if (!resolved) fail(`${t('common.not_exist', { name: cmd })}\n${yellow(t('common.not_exist_hint'))}`);
    launchProfile(resolved.name, resolved.type, ddd, rest);
  } else {
    await mainMenu();
  }
}

main().catch((err) => {
  status('error', err.message);
  process.exit(1);
});
