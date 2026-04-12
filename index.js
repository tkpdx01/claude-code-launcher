#!/usr/bin/env node

// CCC — Claude Code / Codex Settings Launcher
// Zero external dependencies. Profiles store only credentials.
// Never writes to ~/.claude/settings.json or ~/.codex/.

import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import * as store from './src/store.js';
import { launchClaude } from './src/claude.js';
import { launchCodex } from './src/codex.js';
import { select } from './src/prompt.js';
import { red, yellow, green, blue, magenta, gray } from './src/color.js';
import { listCommand } from './src/commands/list.js';
import { newCommand } from './src/commands/new.js';
import { editCommand } from './src/commands/edit.js';
import { deleteCommand } from './src/commands/delete.js';
import { useCommand } from './src/commands/use.js';
import { showCommand } from './src/commands/show.js';
import { helpCommand } from './src/commands/help.js';

// Version from package.json
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

// Parse args
const rawArgs = process.argv.slice(2);
const flags = new Set(rawArgs.filter((a) => a.startsWith('-')));
const positional = rawArgs.filter((a) => !a.startsWith('-'));
const [cmd, ...rest] = positional;

const ddd = flags.has('-d') || flags.has('--ddd');

// Version
if (flags.has('-v') || flags.has('--version') || flags.has('-V')) {
  console.log(pkg.version);
  process.exit(0);
}

// Help
if (flags.has('-h') || flags.has('--help') || cmd === 'help') {
  helpCommand();
  process.exit(0);
}

// Launch by profile type
function launchProfile(name, type, ddd) {
  if (type === 'codex') launchCodex(name, ddd);
  else launchClaude(name, ddd);
}

// Interactive profile selection
async function selectAndLaunch() {
  const all = store.getAllProfiles();
  if (all.length === 0) {
    console.log(yellow('No profiles available'));
    console.log(gray('Use "ccc new" to create one'));
    process.exit(0);
  }

  const def = store.getDefault();
  const choices = all.map((p, i) => {
    const tag = p.type === 'codex' ? blue('[Codex]') : magenta('[Claude]');
    const label = p.name === def
      ? `${i + 1}. ${tag} ${p.name} ${green('(default)')}`
      : `${i + 1}. ${tag} ${p.name}`;
    return { name: label, value: p };
  });

  const defIdx = all.findIndex((p) => p.name === def);
  const profile = await select('Select profile:', choices, Math.max(defIdx, 0));
  launchProfile(profile.name, profile.type, ddd);
}

// Command dispatch
const commands = {
  list: listCommand,
  ls: listCommand,
  new: newCommand,
  edit: editCommand,
  delete: deleteCommand,
  rm: deleteCommand,
  use: useCommand,
  show: showCommand,
};

async function main() {
  if (cmd && commands[cmd]) {
    await commands[cmd](rest, flags);
  } else if (cmd) {
    // Treat as profile name or index
    const resolved = store.resolveProfile(cmd);
    if (resolved) {
      launchProfile(resolved.name, resolved.type, ddd);
    } else {
      console.log(red(`Profile "${cmd}" does not exist`));
      console.log(yellow('Use "ccc list" to see available profiles'));
      process.exit(1);
    }
  } else {
    // No args: try default, otherwise interactive
    const def = store.getDefault();
    if (def) {
      const check = store.anyProfileExists(def);
      if (check.exists) {
        launchProfile(def, check.type, ddd);
      } else {
        await selectAndLaunch();
      }
    } else {
      await selectAndLaunch();
    }
  }
}

main().catch((err) => {
  console.error(red(err.message));
  process.exit(1);
});
