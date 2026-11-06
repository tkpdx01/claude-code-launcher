// Render a real profile-picker frame with demo data, never personal credentials.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { width } from '../src/ui.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccc-preview-'));
let frame;
const previewEnv = { ...process.env, CCC_PREVIEW_HOME: root, FORCE_COLOR: '3', COLORTERM: 'truecolor', TERM: 'xterm-256color' };
delete previewEnv.NO_COLOR;
try {
  fs.mkdirSync(path.join(root, '.ccc/profiles'), { recursive: true });
  fs.mkdirSync(path.join(root, '.ccc/codex-profiles/c'), { recursive: true });
  for (const name of ['cc', 'grok']) fs.writeFileSync(path.join(root, `.ccc/profiles/${name}.json`), JSON.stringify({ type: 'claude', apiKey: 'demo-only' }));
  fs.writeFileSync(path.join(root, '.ccc/codex-profiles/c/auth.json'), '{}');
  fs.writeFileSync(path.join(root, '.ccc/default'), 'cc\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import os from 'node:os';
    import { PassThrough, Writable } from 'node:stream';
    import { Console } from 'node:console';
    os.homedir = () => process.env.CCC_PREVIEW_HOME;
    const original = process.stdout;
    const writes = [];
    const stdout = new Writable({ write(chunk, encoding, cb) { writes.push(chunk.toString()); cb(); } });
    Object.assign(stdout, { isTTY: true, columns: 84, rows: 28 });
    const stdin = new PassThrough();
    stdin.isTTY = true;
    stdin.setRawMode = () => {};
    Object.defineProperty(process, 'stdin', { value: stdin });
    Object.defineProperty(process, 'stdout', { value: stdout });
    globalThis.console = new Console({ stdout, stderr: process.stderr });
    process.argv = [process.execPath, 'ccc'];
    await import(${JSON.stringify(new URL('../index.js', import.meta.url).href)});
    await new Promise(setImmediate);
    original.write(JSON.stringify(writes.join('')));
    stdin.emit('keypress', 'q', { name: 'q' });
  `], { env: previewEnv, encoding: 'utf8', timeout: 10000 });
  if (result.status !== 0) throw new Error(result.stderr);
  frame = JSON.parse(result.stdout);
} finally { fs.rmSync(root, { recursive: true, force: true }); }

const xml = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const palette = { 30: '#17212e', 31: '#f28b92', 32: '#8bd8b0', 33: '#e7c786', 34: '#8cb9ed', 35: '#c5a9e7', 36: '#7edbc9', 37: '#e5edf5', 90: '#8998a9' };
const items = [];
let x = 0, y = 0, fg = '#dce6f0', bg = '', bold = false, dim = false, inverse = false;
for (const token of frame.matchAll(/\x1b\[([\d;?]*)([A-Za-z])|([^\x1b]+)/g)) {
  if (token[2]) {
    if (token[2] !== 'm') continue;
    const codes = token[1].split(';').map(Number);
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      if (code === 0) { fg = '#dce6f0'; bg = ''; bold = dim = inverse = false; }
      else if (code === 1) bold = true;
      else if (code === 2) dim = true;
      else if (code === 22) bold = dim = false;
      else if (code === 7) inverse = true;
      else if (code === 27) inverse = false;
      else if (code === 39) fg = '#dce6f0';
      else if (code === 49) bg = '';
      else if ((code === 38 || code === 48) && codes[i + 1] === 2) {
        const color = `rgb(${codes.slice(i + 2, i + 5).join(',')})`;
        if (code === 38) fg = color; else bg = color;
        i += 4;
      } else if (palette[code]) fg = palette[code];
    }
  } else for (const { segment } of new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(token[3])) {
    if (segment === '\n') { x = 0; y++; continue; }
    if (segment === '\r') { x = 0; continue; }
    const cells = width(segment);
    const left = 32 + x * 10, top = 73 + y * 27;
    const fill = inverse ? '#101923' : fg;
    const background = inverse ? fg : bg;
    if (background) items.push(`<rect x="${left}" y="${top - 19}" width="${cells * 10}" height="27" fill="${background}"/>`);
    if (segment.trim()) items.push(`<text x="${left}" y="${top}" fill="${fill}"${bold ? ' font-weight="700"' : ''}${dim ? ' opacity="0.7"' : ''}>${xml(segment)}</text>`);
    x += cells;
  }
}
const height = 100 + y * 27;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${height}" viewBox="0 0 900 ${height}" role="img" aria-label="CCC 2.6 profile picker with cc selected as default">
<rect width="900" height="${height}" rx="20" fill="#101923"/>
<path d="M20 .5H880Q899.5 .5 899.5 20V${height - 20}Q899.5 ${height - 0.5} 880 ${height - 0.5}H20Q.5 ${height - 0.5} .5 ${height - 20}V20Q.5 .5 20 .5Z" fill="none" stroke="#2a394b"/>
<circle cx="31" cy="27" r="5" fill="#ee7d84"/><circle cx="50" cy="27" r="5" fill="#e7c786"/><circle cx="69" cy="27" r="5" fill="#8bd8b0"/>
<text x="450" y="32" text-anchor="middle" fill="#8495a9" font-family="system-ui,sans-serif" font-size="12">ccc — profiles</text>
<g font-family="Menlo,Consolas,monospace" font-size="16">${items.join('')}</g></svg>\n`;
fs.writeFileSync(new URL('../docs/images/cli-preview.svg', import.meta.url), svg);
