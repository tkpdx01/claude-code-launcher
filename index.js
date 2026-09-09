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
import { red, yellow, green } from './src/color.js';
import { brandHeader, profileChoice, status } from './src/ui.js';
import { listCommand } from './src/commands/list.js';
import { newCommand } from './src/commands/new.js';
import { editCommand } from './src/commands/edit.js';
import { deleteCommand } from './src/commands/delete.js';
import { showCommand } from './src/commands/show.js';
import { helpCommand } from './src/commands/help.js';
import { applyCommand } from './src/commands/apply.js';
import { parseArgs } from './src/args.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

const { cmd, rest, flags } = parseArgs(process.argv.slice(2));
const ddd = flags.has('-d') || flags.has('--ddd');

if (flags.has('-v') || flags.has('--version') || flags.has('-V')) {
  console.log(pkg.version);
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

async function pickProfile(messageKey) {
  const all = store.getAllProfiles();
  if (all.length === 0) return null;
  const choices = all.map((p, i) => profileChoice(p, i));
  return select(t(messageKey), choices);
}

async function mainMenu() {
  const all = store.getAllProfiles();
  const count = all.length;

  console.log();
  console.log(brandHeader(pkg.version, all));

  if (count === 0) {
    console.log(yellow(`  ${t('menu.empty')}\n`));
    await newCommand([]);
    return;
  }

  const langLabel = getLang() === 'zh' ? '中文' : 'EN';

  const action = await select(t('ui.actions'), [
    { name: `↗  ${t('menu.launch')}`, description: t('menu.launch.desc'), value: 'launch' },
    { name: `⇄  ${t('menu.apply')}`, description: t('menu.apply.desc'), value: 'apply' },
    { separator: true, name: '' },
    { name: `+  ${t('menu.new')}`, description: t('menu.new.desc'), value: 'new' },
    { name: `✎  ${t('menu.edit')}`, description: t('menu.edit.desc'), value: 'edit' },
    { name: `◇  ${t('menu.show')}`, description: t('menu.show.desc'), value: 'show' },
    { name: `≡  ${t('menu.list')}`, description: t('menu.list.desc'), value: 'list' },
    { name: `−  ${t('menu.delete')}`, description: t('menu.delete.desc'), value: 'delete' },
    { separator: true, name: '' },
    { name: `◎  ${t('menu.lang')}`, description: `[${langLabel}]  ${t('menu.lang.desc')}`, value: 'lang' },
    { name: `×  ${t('menu.exit')}`, value: 'exit' },
  ]);

  switch (action) {
    case 'launch': {
      const p = await pickProfile('pick.launch');
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
    case 'lang': {
      const next = getLang() === 'en' ? 'zh' : 'en';
      setLang(next);
      console.log(green(`  ${t('lang.switched')}\n`));
      await mainMenu();
      break;
    }
    case 'exit':
      break;
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
};

async function main() {
  if (cmd && Object.prototype.hasOwnProperty.call(commands, cmd)) {
    await commands[cmd](rest, flags);
  } else if (cmd) {
    const resolved = store.resolveProfile(cmd);
    if (resolved) {
      launchProfile(resolved.name, resolved.type, ddd, rest);
    } else {
      console.log(red(t('common.not_exist', { name: cmd })));
      console.log(yellow(t('common.not_exist_hint')));
      process.exit(1);
    }
  } else {
    await mainMenu();
  }
}

main().catch((err) => {
  status('error', err.message);
  process.exit(1);
});
