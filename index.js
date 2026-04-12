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
import { red, yellow, green, blue, magenta, cyan, gray, bold, dim } from './src/color.js';
import { listCommand } from './src/commands/list.js';
import { newCommand } from './src/commands/new.js';
import { editCommand } from './src/commands/edit.js';
import { deleteCommand } from './src/commands/delete.js';
import { showCommand } from './src/commands/show.js';
import { helpCommand } from './src/commands/help.js';
import { applyCommand } from './src/commands/apply.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

// Parse args
const rawArgs = process.argv.slice(2);
const flags = new Set(rawArgs.filter((a) => a.startsWith('-')));
const positional = rawArgs.filter((a) => !a.startsWith('-'));
const [cmd, ...rest] = positional;
const ddd = flags.has('-d') || flags.has('--ddd');

if (flags.has('-v') || flags.has('--version') || flags.has('-V')) {
  console.log(pkg.version);
  process.exit(0);
}

if (flags.has('-h') || flags.has('--help') || cmd === 'help') {
  helpCommand();
  process.exit(0);
}

function launchProfile(name, type, d) {
  if (type === 'codex') launchCodex(name, d);
  else launchClaude(name, d);
}

// --- Profile picker (reused by launch / apply) ---
async function pickProfile(message) {
  const all = store.getAllProfiles();
  if (all.length === 0) return null;

  const choices = all.map((p, i) => {
    const tag = p.type === 'codex' ? blue('[Codex]') : magenta('[Claude]');
    return { name: `${gray(String(i + 1).padStart(2))}  ${tag} ${p.name}`, value: p };
  });

  return select(message, choices);
}

// --- Main menu (ccc with no args) ---
async function mainMenu() {
  const all = store.getAllProfiles();

  console.log(bold(cyan(`\n  CCC`)) + dim(` v${pkg.version}\n`));

  if (all.length === 0) {
    console.log(yellow('  No profiles yet.\n'));
    await newCommand([]);
    return;
  }

  const action = await select('', [
    { name: `${green('Launch')}           start claude/codex with a profile`, value: 'launch' },
    { name: `${green('Apply')}            write credentials to main config`, value: 'apply' },
    { name: `${cyan('New')}              create a new profile`, value: 'new' },
    { name: `${cyan('Edit')}             edit profile credentials`, value: 'edit' },
    { name: `${cyan('Show')}             view profile details`, value: 'show' },
    { name: `${dim('List')}             list all profiles`, value: 'list' },
    { name: `${dim('Delete')}           remove a profile`, value: 'delete' },
  ]);

  switch (action) {
    case 'launch': {
      const p = await pickProfile('Launch:');
      if (p) launchProfile(p.name, p.type, ddd);
      break;
    }
    case 'apply':
      await applyCommand([]);
      break;
    case 'new':
      await newCommand([]);
      break;
    case 'edit':
      await editCommand([]);
      break;
    case 'show':
      await showCommand([]);
      break;
    case 'list':
      listCommand();
      break;
    case 'delete':
      await deleteCommand([]);
      break;
  }
}

// Command dispatch
const commands = {
  list: listCommand,
  ls: listCommand,
  new: newCommand,
  edit: editCommand,
  delete: deleteCommand,
  rm: deleteCommand,
  show: showCommand,
  apply: applyCommand,
};

async function main() {
  if (cmd && commands[cmd]) {
    await commands[cmd](rest, flags);
  } else if (cmd) {
    // Direct launch by profile name or index
    const resolved = store.resolveProfile(cmd);
    if (resolved) {
      launchProfile(resolved.name, resolved.type, ddd);
    } else {
      console.log(red(`Profile "${cmd}" does not exist`));
      console.log(yellow('Use "ccc list" to see available profiles'));
      process.exit(1);
    }
  } else {
    // No args → main menu
    await mainMenu();
  }
}

main().catch((err) => {
  console.error(red(err.message));
  process.exit(1);
});
