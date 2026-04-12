// ANSI color utilities — zero dependencies, replaces chalk

const enabled = process.env.NO_COLOR === undefined && process.env.TERM !== 'dumb';

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

// Composable: bold(cyan('text'))
