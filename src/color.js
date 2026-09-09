// ANSI color utilities — zero dependencies, replaces chalk

const enabled = process.env.NO_COLOR === undefined && process.env.TERM !== 'dumb'
  && process.env.FORCE_COLOR !== '0'
  && (process.stdout.isTTY || (process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== '0'));

const wrap = (open, close) => (s) => enabled
  ? `\x1b[${open}m${String(s).replaceAll(`\x1b[${close}m`, `\x1b[${open}m`)}\x1b[${close}m`
  : String(s);

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
export const inverse = wrap(7, 27);

// Composable: bold(cyan('text'))
