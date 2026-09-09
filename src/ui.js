// Small terminal layout primitives. No fonts, themes, or packages to install.
import { bold, cyan, green, blue, magenta, gray, yellow, red, dim } from './color.js';
import { t } from './i18n.js';

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const sgr = /\x1b\[[0-9;]*m/g;

export function plain(value) {
  return String(value).replace(sgr, '');
}

function cellWidth(grapheme) {
  const code = grapheme.codePointAt(0);
  if (code < 32 || (code >= 0x7f && code < 0xa0) || /^\p{Mark}/u.test(grapheme)) return 0;
  if (/\p{Emoji_Presentation}|\uFE0F/u.test(grapheme)) return 2;
  return code >= 0x1100 && (
    code <= 0x115f || code === 0x2329 || code === 0x232a ||
    (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
    (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) || (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) || (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x3fffd)
  ) ? 2 : 1;
}

export function width(value) {
  let cells = 0;
  for (const { segment } of graphemes.segment(plain(value))) cells += cellWidth(segment);
  return cells;
}

export function clip(value, limit) {
  const text = String(value);
  if (limit <= 0) return '';
  if (width(text) <= limit) return text;
  let result = '';
  let cells = 0;
  for (const token of text.match(/\x1b\[[0-9;]*m|[^\x1b]+/g) || []) {
    if (token.startsWith('\x1b')) {
      result += token;
      continue;
    }
    for (const { segment } of graphemes.segment(token)) {
      const size = cellWidth(segment);
      if (cells + size > limit - 1) return result + '…' + (result.includes('\x1b') ? '\x1b[0m' : '');
      result += segment;
      cells += size;
    }
  }
  return result;
}

export function pad(value, limit) {
  const text = clip(value, limit);
  return text + ' '.repeat(Math.max(0, limit - width(text)));
}

export function columns(max = 76) {
  return Math.max(8, Math.min(max, (process.stdout.columns || 80) - 4));
}

export function typeTag(type) {
  const label = type === 'codex' ? 'Codex' : type === 'deepseek' ? 'DeepSeek' : 'Claude';
  const color = type === 'codex' ? green : type === 'deepseek' ? blue : magenta;
  return color(`● ${label}`);
}

export function profileChoice(profile, index) {
  return {
    name: `${index === undefined ? '' : gray(String(index + 1).padStart(2)) + '  '}${bold(profile.name)}`,
    description: typeTag(profile.type),
    value: profile,
  };
}

export function panel(lines, { title = '', meta = '' } = {}) {
  const size = columns();
  const inner = size - 4;
  if (process.env.TERM === 'dumb' || !process.stdout.isTTY) {
    return ['  ' + [plain(title), plain(meta)].filter(Boolean).join('  '),
      ...lines.map((line) => '  ' + plain(line))].filter((line) => line.trim()).join('\n');
  }
  const titleWidth = Math.max(0, inner - width(meta) - 2);
  const heading = meta && titleWidth > 4
    ? pad(title, inner - width(meta)) + dim(meta)
    : clip(title, inner);
  return [
    `  ${gray('╭' + '─'.repeat(size - 2) + '╮')}`,
    ...(title ? [`  ${gray('│')} ${pad(heading, inner)} ${gray('│')}`] : []),
    ...lines.map((line) => `  ${gray('│')} ${pad(line, inner)} ${gray('│')}`),
    `  ${gray('╰' + '─'.repeat(size - 2) + '╯')}`,
  ].join('\n');
}

export function brandHeader(version, profiles) {
  const counts = ['claude', 'codex', 'deepseek'].map((type) => {
    const count = profiles.filter((p) => p.type === type).length;
    return count ? `${typeTag(type)} ${bold(count)}` : '';
  }).filter(Boolean).join(gray('   /   '));
  const title = `${cyan('◆')} ${bold('CCC')} ${gray('/')} ${t('ui.workspace')}`;
  if ((process.stdout.rows || 24) < 22) {
    return `  ${clip(title + gray(`  v${version}`), columns())}\n`;
  }
  return panel([
    gray('Claude Code · Codex · DeepSeek'),
    counts || dim(t('menu.empty')),
  ], { title, meta: `v${version}` });
}

export function section(title, meta = '') {
  const size = columns();
  const label = `${bold(cyan(title))}${meta ? gray(`  ${meta}`) : ''}`;
  console.log(`\n  ${clip(label, size)}`);
  console.log(`  ${gray('─'.repeat(size))}`);
}

export function hint(message) {
  console.log(`\n  ${gray('↳')} ${dim(message)}\n`);
}

export function status(kind, message, detail = '') {
  const style = { success: [green, '✓'], error: [red, '×'], warning: [yellow, '!'], launch: [cyan, '↗'] }[kind];
  const [color, symbol] = style || [cyan, '·'];
  const write = kind === 'error' ? console.error : console.log;
  write(`\n  ${color(symbol)} ${bold(message)}`);
  if (detail) write(`    ${gray(detail)}`);
  write();
}
