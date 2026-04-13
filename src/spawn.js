import { spawn } from 'child_process';

export function spawnCli(command, args, options = {}) {
  if (process.platform === 'win32') {
    const comspec = process.env.ComSpec || process.env.comspec || 'cmd.exe';
    return spawn(comspec, ['/d', '/s', '/c', command, ...args], {
      ...options,
      windowsHide: true,
    });
  }

  return spawn(command, args, options);
}
