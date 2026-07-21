#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseInvocation } from './src/args.js';
import * as store from './src/store.js';
import { launchClaude } from './src/claude.js';
import { launchCodex } from './src/codex.js';
import { select } from './src/prompt.js';
import { getLang, setLang, t } from './src/i18n.js';
import { dim, green, gray, yellow } from './src/color.js';
import { brand, error, padVisible, typeBadge } from './src/ui.js';
import { listCommand } from './src/commands/list.js';
import { newCommand } from './src/commands/new.js';
import { editCommand } from './src/commands/edit.js';
import { deleteCommand } from './src/commands/delete.js';
import { showCommand } from './src/commands/show.js';
import { helpCommand } from './src/commands/help.js';
import { applyCommand } from './src/commands/apply.js';
import { modelCommand, modelsCommand } from './src/commands/models.js';
import { doctorCommand } from './src/commands/doctor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

function launchProfile(profile, options) {
  if (profile.type === 'codex') launchCodex(profile.name, options);
  else launchClaude(profile.name, options);
}

async function pickProfile(message) {
  const profiles = store.getAllProfiles();
  if (profiles.length === 0) return null;
  return select(message, profiles.map((profile, index) => ({
    name: `${gray(String(index + 1).padStart(2, '0'))}  ${typeBadge(profile.type)}  ${profile.name}`,
    value: profile,
  })));
}

async function mainMenu(options = {}) {
  const profiles = store.getAllProfiles();
  brand(pkg.version, profiles.length
    ? `${profiles.length} profiles · choose an action`
    : 'Create your first profile');

  if (profiles.length === 0) {
    console.log(`  ${yellow(t('menu.empty'))}\n`);
    await newCommand([]);
    return;
  }

  const langLabel = getLang() === 'zh' ? '中文' : 'EN';
  const width = 14;
  const action = await select('', [
    { name: `${padVisible(green(`▶  ${t('menu.launch')}`), width)} ${dim(t('menu.launch.desc'))}`, value: 'launch' },
    { name: `${padVisible(`◈  ${t('menu.models')}`, width)} ${dim(t('menu.models.desc'))}`, value: 'models' },
    { name: `${padVisible(`＋ ${t('menu.new')}`, width)} ${dim(t('menu.new.desc'))}`, value: 'new' },
    { name: `${padVisible(`✎  ${t('menu.edit')}`, width)} ${dim(t('menu.edit.desc'))}`, value: 'edit' },
    { name: `${padVisible(`◎  ${t('menu.list')}`, width)} ${dim(t('menu.list.desc'))}`, value: 'list' },
    { name: `${padVisible(`◉  ${t('menu.show')}`, width)} ${dim(t('menu.show.desc'))}`, value: 'show' },
    { name: `${padVisible(`−  ${t('menu.delete')}`, width)} ${dim(t('menu.delete.desc'))}`, value: 'delete' },
    { separator: true, name: '' },
    { name: `${padVisible(`◇  ${t('menu.apply')}`, width)} ${dim(t('menu.apply.desc'))}`, value: 'apply' },
    { name: `${padVisible(`♥  ${t('menu.doctor')}`, width)} ${dim(t('menu.doctor.desc'))}`, value: 'doctor' },
    { name: `${padVisible(`文 ${t('menu.lang')}`, width)} ${dim(`[${langLabel}]`)}`, value: 'lang' },
    { name: `${padVisible(`×  ${t('menu.exit')}`, width)} ${dim('Close CCC')}`, value: 'exit' },
  ]);

  if (action === 'launch') {
    const profile = await pickProfile(t('pick.launch'));
    if (profile) launchProfile(profile, options);
  } else if (action === 'models') {
    const profile = await pickProfile('Discover models for:');
    if (profile) await modelsCommand([profile.name]);
  } else if (action === 'new') await newCommand([]);
  else if (action === 'edit') await editCommand([]);
  else if (action === 'list') listCommand();
  else if (action === 'show') await showCommand([]);
  else if (action === 'delete') await deleteCommand([]);
  else if (action === 'apply') await applyCommand([]);
  else if (action === 'doctor') await doctorCommand([]);
  else if (action === 'lang') {
    setLang(getLang() === 'en' ? 'zh' : 'en');
    console.log(green(`  ${t('lang.switched')}\n`));
    await mainMenu(options);
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
  models: modelsCommand,
  model: modelCommand,
  doctor: doctorCommand,
};

async function main() {
  const invocation = parseInvocation(process.argv.slice(2));
  if (invocation.kind === 'version') {
    console.log(pkg.version);
    return;
  }
  if (invocation.kind === 'help') {
    helpCommand(pkg.version);
    return;
  }
  if (invocation.kind === 'command') {
    await commands[invocation.command](invocation.args);
    return;
  }
  if (invocation.kind === 'launch') {
    const profile = store.resolveProfile(invocation.profile);
    if (!profile) throw new Error(t('common.not_exist', { name: invocation.profile }));
    launchProfile(profile, { dangerous: invocation.dangerous, args: invocation.args });
    return;
  }
  if (!process.stdin.isTTY) {
    helpCommand(pkg.version);
    return;
  }
  await mainMenu({ dangerous: invocation.dangerous, args: invocation.args });
}

main().catch((err) => {
  error(err?.message || String(err));
  if (process.env.CCC_DEBUG) console.error(err?.stack || err);
  process.exitCode = 1;
});
