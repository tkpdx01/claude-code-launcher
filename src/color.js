// ANSI color utilities — zero dependencies, replaces chalk

const enabled = Boolean(
  process.stdout.isTTY &&
  process.env.NO_COLOR === undefined &&
  process.env.TERM !== 'dumb',
);

const wrap = (open, close) => (s) => enabled ? `\x1b[${open}m${s}\x1b[${close}m` : String(s);

export const red = wrap(31, 39);
export const green = wrap(32, 39);
export const yellow = wrap(33, 39);
export const blue = wrap(34, 39);
export const magenta = wrap(35, 39);
export const cyan = wrap(36, 39);
export const gray = wrap(90, 39);
export const white = wrap(37, 39);
export const bold = wrap(1, 22);
export const dim = wrap(2, 22);
export const underline = wrap(4, 24);

export function stripAnsi(value) {
  return String(value).replace(/\x1b\[[0-9;]*m/g, '');
}

export function colorsEnabled() {
  return enabled;
}

// Composable: bold(cyan('text'))
