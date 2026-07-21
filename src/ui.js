import {
  blue,
  bold,
  cyan,
  dim,
  gray,
  green,
  magenta,
  red,
  stripAnsi,
  yellow,
} from './color.js';

export const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

const symbols = {
  brand: '◆',
  success: '✓',
  warning: '!',
  error: '×',
  info: 'i',
  arrow: '›',
  danger: '⚠',
};

export function visualWidth(value) {
  let width = 0;
  for (const char of stripAnsi(value)) {
    const code = char.codePointAt(0);
    width += code > 0xff ? 2 : 1;
  }
  return width;
}

export function padVisible(value, width) {
  return String(value) + ' '.repeat(Math.max(0, width - visualWidth(value)));
}

export function brand(version, subtitle = '') {
  const title = `${magenta(symbols.brand)} ${bold(cyan('CCC'))} ${dim(`v${version}`)}`;
  console.log();
  console.log(`  ${title}`);
  if (subtitle) console.log(`  ${gray(subtitle)}`);
  console.log();
}

export function section(title) {
  console.log(`  ${bold(title)}`);
}

export function success(message) {
  console.log(`${green(symbols.success)} ${message}`);
}

export function warning(message) {
  console.log(`${yellow(symbols.warning)} ${message}`);
}

export function error(message) {
  console.error(`${red(symbols.error)} ${message}`);
}

export function info(message) {
  console.log(`${blue(symbols.info)} ${message}`);
}

export function danger(message) {
  console.log(`${yellow(symbols.danger)} ${bold(message)}`);
}

export function typeBadge(type) {
  if (type === 'codex') return blue('CODEX');
  if (type === 'deepseek') return green('DEEPSEEK');
  return magenta('CLAUDE');
}

export function maskSecret(value) {
  const text = String(value || '');
  if (!text) return '(not set)';
  if (text.length <= 8) return '••••••••';
  return `${text.slice(0, 4)}••••${text.slice(-4)}`;
}

export function redactUrl(value) {
  const text = String(value || '');
  try {
    const url = new URL(text);
    if (url.username) url.username = 'redacted';
    if (url.password) url.password = 'redacted';
    for (const key of url.searchParams.keys()) {
      if (/(?:key|token|secret|password|signature)/i.test(key)) {
        url.searchParams.set(key, '<redacted>');
      }
    }
    return url.toString().replace(/%3Credacted%3E/g, '<redacted>');
  } catch {
    return text;
  }
}

export function redactSecrets(value, key = '') {
  if (/(?:key|token|secret|password|authorization|credential)/i.test(key)) {
    return '<redacted>';
  }
  if (typeof value === 'string' && (/(?:^|\s)sk-[A-Za-z0-9_-]{12,}/.test(value) || /^Bearer\s+\S+/i.test(value))) {
    return '<redacted>';
  }
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item));
  if (value && Object.prototype.toString.call(value) === '[object Object]') {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) =>
      [childKey, redactSecrets(child, childKey)]));
  }
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return redactUrl(value);
  return value;
}

function redactCommandArg(value) {
  let text = String(value);
  text = text.replace(/sk-[A-Za-z0-9_-]{12,}/g, 'sk-<redacted>');
  text = text.replace(/(https?:\/\/[^"'\s]+)/g, (url) => redactUrl(url));
  if (/(?:key|token|secret|password|authorization)=/i.test(text)) {
    text = text.replace(/=(.*)$/, '=<redacted>');
  }
  return text;
}

export function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

export function formatCommand(command, args = []) {
  const sensitiveFlags = new Set(['--api-key', '--token', '--password', '--authorization']);
  let redactNext = false;
  return [command, ...args].map((arg) => {
    if (redactNext) {
      redactNext = false;
      return shellQuote('<redacted>');
    }
    if (sensitiveFlags.has(String(arg).toLowerCase())) redactNext = true;
    return shellQuote(redactCommandArg(arg));
  }).join(' ');
}

export function commandPreview(command, args = [], prefix = '') {
  const rendered = `${prefix ? `${prefix} ` : ''}${formatCommand(command, args)}`;
  console.log(`  ${dim(symbols.arrow)} ${gray(rendered)}`);
}

export function panel(title, rows, tone = 'cyan') {
  const paint = tone === 'danger' ? yellow : tone === 'success' ? green : cyan;
  const normalized = rows.map(([key, value]) => [String(key), String(value)]);
  const keyWidth = Math.max(0, ...normalized.map(([key]) => visualWidth(key)));
  console.log(`  ${paint('╭─')} ${bold(title)}`);
  for (const [key, value] of normalized) {
    console.log(`  ${paint('│')} ${dim(padVisible(key, keyWidth))}  ${value}`);
  }
  console.log(`  ${paint('╰─')}`);
}

export async function withSpinner(label, task) {
  if (!isInteractive) return task();
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let index = 0;
  process.stdout.write(`  ${cyan(frames[index])} ${label}`);
  const timer = setInterval(() => {
    index = (index + 1) % frames.length;
    process.stdout.write(`\r  ${cyan(frames[index])} ${label}`);
  }, 80);
  try {
    return await task();
  } finally {
    clearInterval(timer);
    process.stdout.write('\r\x1b[2K');
  }
}
