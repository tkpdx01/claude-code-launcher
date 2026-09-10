import { spawn } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';

function windowsEnv(env, name) {
  const key = Object.keys(env).sort().find((key) => key.toUpperCase() === name);
  return key === undefined ? '' : env[key];
}

function resolveWindowsCommand(command, options) {
  const env = options.env || process.env;
  const dirs = [options.cwd || process.cwd(), ...windowsEnv(env, 'PATH').split(';')];
  const extensions = windowsEnv(env, 'PATHEXT') || '.COM;.EXE;.BAT;.CMD';
  // npm also installs an extensionless POSIX shim beside its Windows .cmd.
  // Follow PATHEXT for bare commands so that shim is never treated as an exe.
  const suffixes = path.extname(command) ? [''] : extensions.split(';').filter(Boolean);
  for (const dir of dirs) {
    for (const ext of suffixes) {
      const candidate = path.resolve(dir.replace(/^"|"$/g, ''), command + ext);
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch { /* Try the next PATH entry. */ }
    }
  }
  return command;
}

function quoteBatchArgument(value) {
  // Quote for the target program's argv parser, then escape both cmd.exe
  // passes (the outer shell and the .cmd/.bat wrapper's argument expansion).
  let quoted = '"';
  let slashes = 0;
  for (const ch of String(value)) {
    if (ch === '\\') {
      slashes++;
    } else {
      quoted += '\\'.repeat(ch === '"' ? slashes * 2 + 1 : slashes) + ch;
      slashes = 0;
    }
  }
  quoted += '\\'.repeat(slashes * 2) + '"';
  const escape = (text) => text.replace(/[()%!^"<>&|;, *?\[\]`]/g, '^$&');
  return escape(escape(quoted));
}

function releaseTerminal() {
  if (!process.stdin.isTTY) return;
  try {
    if (process.stdin.isRaw) process.stdin.setRawMode(false);
  } catch { /* Child spawn should not fail because the TTY is already restored. */ }
}

export function spawnCli(command, args, options = {}) {
  releaseTerminal();
  if (process.platform === 'win32') {
    const executable = resolveWindowsCommand(command, options);
    if (!/\.(cmd|bat)$/i.test(executable)) return spawn(executable, args, options);
    const comspec = process.env.ComSpec || process.env.comspec || 'cmd.exe';
    const escapedCommand = executable.replace(/[()%!^"<>&|;, *?\[\]`]/g, '^$&');
    const script = [escapedCommand, ...args.map(quoteBatchArgument)].join(' ');
    return spawn(comspec, ['/d', '/s', '/c', `"${script}"`], {
      ...options,
      windowsHide: true,
      windowsVerbatimArguments: true,
    });
  }

  return spawn(command, args, options);
}

// Preserve child failures, forward termination, and release per-launch resources.
export function superviseCli(child, { cleanup = () => {}, onError = () => {} } = {}) {
  const handlers = new Map();
  let finished = false;

  function finish(code) {
    if (finished) return;
    finished = true;
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
    process.removeListener('exit', cleanup);
    try {
      cleanup();
    } finally {
      process.exit(code);
    }
  }

  child.once('close', (code, signal) => {
    finish(code ?? (signal ? 128 + (os.constants.signals[signal] || 1) : 1));
  });
  child.once('error', (err) => {
    onError(err);
    finish(1);
  });
  process.once('exit', cleanup);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    const handler = () => child.kill(signal);
    handlers.set(signal, handler);
    process.on(signal, handler);
  }
}
