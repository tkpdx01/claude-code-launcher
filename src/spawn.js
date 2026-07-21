import crossSpawn from 'cross-spawn';
import os from 'node:os';

export function spawnCli(command, args, options = {}) {
  return crossSpawn(command, args, {
    ...options,
    windowsHide: true,
  });
}

const SIGNAL_EXIT_CODES = {
  SIGHUP: 129,
  SIGINT: 130,
  SIGTERM: 143,
};

export function manageChildLifecycle(child, options = {}) {
  let finished = false;
  const cleanup = () => {
    try {
      options.cleanup?.();
    } catch { /* cleanup must not hide the child result */ }
  };
  const finish = (code) => {
    if (finished) return;
    finished = true;
    cleanup();
    process.exit(code);
  };

  child.once('error', (err) => {
    options.onError?.(err);
    finish(1);
  });
  child.once('close', (code, signal) => {
    const signalCode = signal
      ? 128 + (os.constants.signals[signal] || 0)
      : null;
    finish(code ?? SIGNAL_EXIT_CODES[signal] ?? signalCode ?? 1);
  });

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.once(signal, () => {
      if (!child.killed) child.kill(signal);
    });
  }
}
