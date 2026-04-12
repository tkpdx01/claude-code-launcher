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

async function pickProfile(messageKey) {
  const all = store.getAllProfiles();
  if (all.length === 0) return null;
  const choices = all.map((p, i) => {
    const tag = p.type === 'codex' ? blue('[Codex]') : magenta('[Claude]');
    return { name: `${gray(String(i + 1).padStart(2))}  ${tag} ${p.name}`, value: p };
  });
  return select(t(messageKey), choices);
}

function pad(s, w) {
  // Pad accounting for CJK double-width characters
  const visible = s.replace(/\x1b\[[0-9;]*m/g, '');
  let len = 0;
  for (const ch of visible) len += ch.charCodeAt(0) > 0x7f ? 2 : 1;
  return s + ' '.repeat(Math.max(0, w - len));
}

async function mainMenu() {
  const all = store.getAllProfiles();
  const count = all.length;

  console.log();
  console.log(`  ${bold(cyan('CCC'))} ${dim(`v${pkg.version}`)}`);
  if (count > 0) {
    console.log(`  ${dim(t('menu.header', { count }))}`);
  }
  console.log();

  if (count === 0) {
    console.log(yellow(`  ${t('menu.empty')}\n`));
    await newCommand([]);
    return;
  }

  const langLabel = getLang() === 'zh' ? '中文' : 'EN';
  const W = 12; // label column width

  const action = await select('', [
    { name: `${pad(green(t('menu.launch')), W)} ${dim(t('menu.launch.desc'))}`, value: 'launch' },
    { name: `${pad(green(t('menu.apply')), W)} ${dim(t('menu.apply.desc'))}`, value: 'apply' },
    { separator: true, name: '' },
    { name: `${pad(cyan(t('menu.new')), W)} ${dim(t('menu.new.desc'))}`, value: 'new' },
    { name: `${pad(cyan(t('menu.edit')), W)} ${dim(t('menu.edit.desc'))}`, value: 'edit' },
    { name: `${pad(cyan(t('menu.show')), W)} ${dim(t('menu.show.desc'))}`, value: 'show' },
    { name: `${pad(dim(t('menu.list')), W)} ${dim(t('menu.list.desc'))}`, value: 'list' },
    { name: `${pad(dim(t('menu.delete')), W)} ${dim(t('menu.delete.desc'))}`, value: 'delete' },
    { separator: true, name: '' },
    { name: `${pad(dim(t('menu.lang')), W)} ${dim(`[${langLabel}]`)} ${dim(t('menu.lang.desc'))}`, value: 'lang' },
    { name: `${dim(t('menu.exit'))}`, value: 'exit' },
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
  if (cmd && commands[cmd]) {
    await commands[cmd](rest, flags);
  } else if (cmd) {
    const resolved = store.resolveProfile(cmd);
    if (resolved) {
      launchProfile(resolved.name, resolved.type, ddd);
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
  console.error(red(err.message));
  process.exit(1);
});
